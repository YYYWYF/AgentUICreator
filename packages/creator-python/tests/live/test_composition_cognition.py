from __future__ import annotations

import asyncio
import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from statistics import median
from typing import Any
from urllib.parse import quote

import pytest

from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.domain_agent import create_domain_write_creator_agent
from agent_ui_creator.files import read_creator_file_state
from agent_ui_creator.model_factory import create_creator_chat_model
from agent_ui_creator.model_protocol.provider_trace import ProviderResponseTraceCollector
from agent_ui_creator.model_settings import CreatorModelSettings
from agent_ui_creator.observability import CreatorRunLogger
from agent_ui_creator.runtime_diagnostics import (
    RuntimeDiagnosticEnvelope,
    RuntimeDiagnosticStore,
)
from agent_ui_creator.validation import CreatorValidationCommandRunner


REPOSITORY_ROOT = Path(__file__).resolve().parents[4]
TARGET_PROJECT = REPOSITORY_ROOT / "examples" / "agent-frontend"
SKILLS_ROOT = REPOSITORY_ROOT / "packages" / "creator" / "skills"
APP_UI_MODEL_PATH = "app-ui/app-ui.json"
SURFACE_PLUGIN_ROOT = "plugins/conversation-surface"
CASE_A_PROMPT = "我要会话管理的功能"
CASE_B_PROMPT = "帮我去掉左边的历史会话"
CASE_C_PROMPT = "给这个应用加一个主题切换功能"
CASE_D_PROMPT = "修改历史会话列表的具体展示行为"
CASE_E_PROMPT = "添加会话管理入口，并让历史列表支持搜索"
_LIVE_RUN_METRICS: list[tuple[int, int]] = []


@pytest.fixture(scope="module", autouse=True)
def _live_slo_report():
    yield
    if len(_LIVE_RUN_METRICS) < 3:
        return
    model_calls = [item[0] for item in _LIVE_RUN_METRICS]
    project_control_reads = [item[1] for item in _LIVE_RUN_METRICS]
    assert median(model_calls) <= 6
    assert max(model_calls) <= 8
    assert median(project_control_reads) <= 2
    assert max(project_control_reads) <= 3


def _copy_target(tmp_path: Path) -> Path:
    project_root = tmp_path / "agent-frontend"
    shutil.copytree(
        TARGET_PROJECT,
        project_root,
        ignore=shutil.ignore_patterns("node_modules", "dist", ".agentuicreator"),
    )
    os.symlink(TARGET_PROJECT / "node_modules", project_root / "node_modules")
    return project_root


def _set_thread_list_fixture(project_root: Path, *, enabled: bool) -> None:
    path = project_root / APP_UI_MODEL_PATH
    model = json.loads(path.read_text(encoding="utf-8"))
    root = model["root"]
    children = root["children"]
    sizes = root["sizes"]
    has_thread_list = any(
        child.get("child", {}).get("plugins", [{}])[0].get("pluginId")
        == "conversation-thread-list"
        for child in children
        if isinstance(child, dict)
        and isinstance(child.get("child"), dict)
        and child["child"].get("plugins")
    )
    if enabled == has_thread_list:
        return
    if enabled:
        children.insert(
            0,
            {
                "type": "panel",
                "child": {
                    "type": "slot",
                    "plugins": [
                        {
                            "id": "conversation-thread-list-main",
                            "pluginId": "conversation-thread-list",
                            "enabled": True,
                        }
                    ],
                },
                "width": 300,
            },
        )
        sizes.insert(0, "300px")
    else:
        children.pop(0)
        sizes.pop(0)
    path.write_text(
        f"{json.dumps(model, ensure_ascii=False, indent=2)}\n", encoding="utf-8"
    )


def _set_theme_switch_fixture(project_root: Path, *, enabled: bool) -> None:
    """Keep the existing theme capability available without authoring source edits."""

    path = project_root / APP_UI_MODEL_PATH
    model = json.loads(path.read_text(encoding="utf-8"))

    def visit_plugins(plugins: object) -> None:
        if not isinstance(plugins, list):
            return
        for plugin in plugins:
            if not isinstance(plugin, dict):
                continue
            if plugin.get("pluginId") == "conversation-surface":
                slots = plugin.setdefault("slots", {})
                if isinstance(slots, dict):
                    suggestions = slots.setdefault("emptySuggestions", [])
                    if isinstance(suggestions, list):
                        suggestions[:] = [
                            child
                            for child in suggestions
                            if not (
                                isinstance(child, dict)
                                and child.get("pluginId") == "theme-switch"
                            )
                        ]
                        if enabled:
                            suggestions.append(
                                {
                                    "id": "theme-switch-main",
                                    "pluginId": "theme-switch",
                                    "enabled": True,
                                }
                            )
            slots = plugin.get("slots")
            if isinstance(slots, dict):
                for children in slots.values():
                    visit_plugins(children)

    visit_plugins(model.get("applicationPlugins"))

    def visit_layout(node: object) -> None:
        if not isinstance(node, dict):
            return
        if node.get("type") == "slot":
            visit_plugins(node.get("plugins"))
        elif node.get("type") == "panel":
            visit_layout(node.get("child"))
        else:
            for child in node.get("children", []):
                visit_layout(child)

    visit_layout(model.get("root"))
    path.write_text(
        f"{json.dumps(model, ensure_ascii=False, indent=2)}\n", encoding="utf-8"
    )


def _source_snapshot(project_root: Path, relative_root: str) -> dict[str, bytes]:
    root = project_root / relative_root
    return {
        path.relative_to(project_root).as_posix(): path.read_bytes()
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


def _js_encoded(value: str) -> str:
    return quote(value, safe="-_.!~*'()")


def _walk_authoring_plugins(model: dict[str, object]) -> list[dict[str, object]]:
    result: list[dict[str, object]] = []

    def visit_plugins(plugins: object) -> None:
        if not isinstance(plugins, list):
            return
        for plugin in plugins:
            if not isinstance(plugin, dict):
                continue
            result.append(plugin)
            slots = plugin.get("slots")
            if isinstance(slots, dict):
                for children in slots.values():
                    visit_plugins(children)

    def visit_layout(node: object) -> None:
        if not isinstance(node, dict):
            return
        node_type = node.get("type")
        if node_type == "slot":
            visit_plugins(node.get("plugins"))
        elif node_type == "panel":
            visit_layout(node.get("child"))
        else:
            for child in node.get("children", []):
                visit_layout(child)

    visit_plugins(model.get("applicationPlugins"))
    visit_layout(model.get("root"))
    return result


def _runtime_instances(model: dict[str, object]) -> list[dict[str, str]]:
    instances: list[dict[str, str]] = []

    def visit_plugins(plugins: object, slot_id: str | None) -> None:
        if not isinstance(plugins, list):
            return
        for plugin in plugins:
            if not isinstance(plugin, dict):
                continue
            instance_id = plugin.get("id")
            plugin_id = plugin.get("pluginId")
            if (
                isinstance(instance_id, str)
                and isinstance(plugin_id, str)
                and plugin.get("enabled", True) is True
                and slot_id is not None
            ):
                instances.append(
                    {
                        "instanceId": instance_id,
                        "pluginId": plugin_id,
                        "slotId": slot_id,
                    }
                )
            slots = plugin.get("slots")
            if not isinstance(slots, dict) or not isinstance(instance_id, str):
                continue
            for local_slot, children in sorted(slots.items()):
                if isinstance(local_slot, str):
                    visit_plugins(
                        children,
                        f"plugin:{_js_encoded(instance_id)}:{_js_encoded(local_slot)}",
                    )

    visit_plugins(model.get("applicationPlugins"), None)

    def visit_layout(node: object, path: str) -> None:
        if not isinstance(node, dict):
            return
        node_type = node.get("type")
        if node_type == "slot":
            visit_plugins(node.get("plugins"), f"layout-slot:{_js_encoded(path)}")
        elif node_type == "panel":
            visit_layout(node.get("child"), f"{path}.child")
        else:
            for index, child in enumerate(node.get("children", [])):
                visit_layout(child, f"{path}.children[{index}]")

    visit_layout(model.get("root"), "root")
    return instances


def _assert_fast_path_slo(result) -> dict[str, object]:
    metrics = result.composition_fast_path_metrics.to_dict()
    assert metrics["attempted"] is True
    assert metrics["eligible"] is True
    assert metrics["modelCallsBeforeFirstMutation"] <= 3
    assert metrics["readRoundsBeforeFirstMutation"] <= 2
    assert metrics["filesystemSourceReadsBeforeMutation"] == 0
    assert metrics["crossLayerReadAttemptsBeforeMutation"] == 0
    assert metrics["duplicateObservationAttempts"] == 0
    assert metrics["firstMutationSucceeded"] is True
    assert metrics["firstMutationErrorCode"] is None
    return metrics


def _print_live_trajectory(
    *, case: str, repeat: int, prompt: str, result, trajectory_path: Path | None
) -> None:
    fast_path = result.composition_fast_path_metrics.to_dict()
    print(
        json.dumps(
            {
                "case": case,
                "repeat": repeat,
                "prompt": prompt,
                "trajectoryPath": (
                    None if trajectory_path is None else str(trajectory_path)
                ),
                "compositionFastPath": fast_path,
                "mutationRequests": result.app_ui_model_mutations.requests,
                "semanticReplans": result.change_layer_metrics["semanticReplans"],
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )


class _LiveValidationRunner:
    def __init__(
        self, project_root: Path, diagnostics: RuntimeDiagnosticStore, thread_id: str
    ) -> None:
        self.project_root = project_root
        self.diagnostics = diagnostics
        self.thread_id = thread_id
        self.runner = CreatorValidationCommandRunner(project_root)

    async def execute_known_command(self, command):
        result = await self.runner.execute_known_command(command)
        if command == "pnpm typecheck" and result.exit_code == 0:
            model = json.loads(
                (self.project_root / APP_UI_MODEL_PATH).read_text(encoding="utf-8")
            )
            app_ui_model_hash = read_creator_file_state(
                self.project_root, APP_UI_MODEL_PATH
            ).hash
            self.diagnostics.record(
                RuntimeDiagnosticEnvelope.model_validate(
                    {
                        "threadId": self.thread_id,
                        "composition": {
                            "schemaVersion": 1,
                            "appUIModelHash": app_ui_model_hash,
                            "observedAt": datetime.now(timezone.utc).isoformat(),
                            "application": {"phase": "ready"},
                            "instances": _runtime_instances(model),
                            "slots": [],
                        },
                    }
                )
            )
        return result


def _create_live_agent(
    project_root: Path, thread_id: str
) -> tuple[Any, CreatorActivityRecorder, CreatorRunLogger]:
    diagnostics = RuntimeDiagnosticStore()
    logger = CreatorRunLogger(project_root)
    logger.begin(run_id=thread_id, thread_id=thread_id)
    activity = CreatorActivityRecorder(project_root, logger=logger)
    activity.begin(thread_id)
    settings = CreatorModelSettings.from_environment()
    provider_trace_collector = ProviderResponseTraceCollector(enabled=False)
    agent = create_domain_write_creator_agent(
        model=create_creator_chat_model(
            settings,
            thread_id=thread_id,
            provider_trace_collector=provider_trace_collector,
        ),
        workspace=project_root,
        skills_root=SKILLS_ROOT,
        diagnostics=diagnostics,
        thread_id=thread_id,
        validation_runner=_LiveValidationRunner(
            project_root, diagnostics, thread_id
        ),
        automatic_completion_repair=True,
        provider_trace_collector=provider_trace_collector,
        activity=activity,
    )
    return agent, activity, logger


def _provider_unavailable(error: BaseException) -> bool:
    message = f"{type(error).__name__}: {error}".lower()
    return any(
        marker in message
        for marker in (
            "timeout",
            "timed out",
            "connection",
            "connecterror",
            "temporarily unavailable",
            "service unavailable",
            "status code: 502",
            "status code: 503",
            "status code: 504",
            "rate limit",
        )
    )


def _run_live_prompt(agent: Any, prompt: str, *, case: str, repeat: int):
    try:
        return asyncio.run(agent.run(prompt))
    except BaseException as error:
        if _provider_unavailable(error):
            print(
                json.dumps(
                    {
                        "case": case,
                        "repeat": repeat,
                        "status": "provider_unavailable",
                        "reason": str(error),
                    },
                    ensure_ascii=False,
                    sort_keys=True,
                )
            )
            pytest.skip(f"Live model provider unavailable for case {case}: {error}")
        raise


def _finish_live_run(
    *,
    case: str,
    repeat: int,
    prompt: str,
    result,
    activity: CreatorActivityRecorder,
    logger: CreatorRunLogger,
):
    receipt = activity.finish()
    logger.finish(
        "success",
        metrics=result.metrics.to_dict(),
        change_layer_metrics=result.change_layer_metrics,
        composition_fast_path_metrics=result.composition_fast_path_metrics.to_dict(),
        project_control_metrics=result.project_control.to_dict(),
    )
    _print_live_trajectory(
        case=case,
        repeat=repeat,
        prompt=prompt,
        result=result,
        trajectory_path=logger.path,
    )
    return receipt


@pytest.mark.live_model
@pytest.mark.skipif(
    os.environ.get("CREATOR_RUN_LIVE_MODEL") != "1",
    reason="Set CREATOR_RUN_LIVE_MODEL=1 to run live Creator cognition.",
)
@pytest.mark.parametrize("repeat", range(5))
def test_live_conversation_management_reuses_composition_capability(tmp_path, repeat):
    project_root = _copy_target(tmp_path)
    _set_thread_list_fixture(project_root, enabled=False)
    plugin_sources_before = _source_snapshot(project_root, "plugins")
    services_before = _source_snapshot(project_root, "services")
    agent_ui_before = _source_snapshot(project_root, "agent-ui")
    agent_contract_before = _source_snapshot(project_root, "agent-contract")
    thread_id = f"live-composition-conversation-management-{repeat}"
    agent, activity, logger = _create_live_agent(project_root, thread_id)

    result = _run_live_prompt(agent, CASE_A_PROMPT, case="A", repeat=repeat)
    receipt = _finish_live_run(
        case="A",
        repeat=repeat,
        prompt=CASE_A_PROMPT,
        result=result,
        activity=activity,
        logger=logger,
    )
    model = json.loads(
        (project_root / APP_UI_MODEL_PATH).read_text(encoding="utf-8")
    )
    authoring_plugins = _walk_authoring_plugins(model)
    plugin_ids = {plugin.get("pluginId") for plugin in authoring_plugins}

    assert "conversation-thread-list" in plugin_ids
    assert "conversation-surface" in plugin_ids
    assert "conversation-service" in plugin_ids
    assert _source_snapshot(project_root, "plugins") == plugin_sources_before
    assert _source_snapshot(project_root, "services") == services_before
    assert _source_snapshot(project_root, "agent-ui") == agent_ui_before
    assert _source_snapshot(project_root, "agent-contract") == agent_contract_before

    metrics = result.change_layer_metrics
    _assert_fast_path_slo(result)
    assert result.project_control.requestsByOperation.get("inspect_ui_services", 0) == 0
    assert metrics["executedChangeLayer"] == "composition"
    assert metrics["executedChangeLayers"] == ["composition"]
    assert metrics["appUIModelMutationAttempts"] == 1
    assert metrics["successfulAppUIModelMutations"] == 1
    assert result.app_ui_model_mutations.requests == 1
    assert metrics["sourceWrites"] == 0
    assert metrics["semanticReplans"] == 0
    _LIVE_RUN_METRICS.append(
        (result.metrics.modelCalls, metrics["projectControlReads"])
    )
    assert receipt["verification"]["status"] == "changed-and-verified"
    assert all(
        check["status"] == "passed" for check in receipt["verification"]["checks"]
    )
    assert all(check["status"] == "passed" for check in receipt["validations"])


@pytest.mark.live_model
@pytest.mark.skipif(
    os.environ.get("CREATOR_RUN_LIVE_MODEL") != "1",
    reason="Set CREATOR_RUN_LIVE_MODEL=1 to run live Creator cognition.",
)
@pytest.mark.parametrize("repeat", range(3))
def test_live_composition_cognition_is_resource_scoped(tmp_path, repeat):
    project_root = _copy_target(tmp_path)
    _set_thread_list_fixture(project_root, enabled=True)
    surface_before = _source_snapshot(project_root, SURFACE_PLUGIN_ROOT)
    service_before = (project_root / "services" / "conversations.ts").read_bytes()
    thread_id = f"live-composition-cognition-{repeat}"
    agent, activity, logger = _create_live_agent(project_root, thread_id)

    result = _run_live_prompt(agent, CASE_B_PROMPT, case="B", repeat=repeat)
    receipt = _finish_live_run(
        case="B",
        repeat=repeat,
        prompt=CASE_B_PROMPT,
        result=result,
        activity=activity,
        logger=logger,
    )
    model = json.loads(
        (project_root / APP_UI_MODEL_PATH).read_text(encoding="utf-8")
    )
    authoring_plugins = _walk_authoring_plugins(model)
    plugin_ids = {plugin.get("pluginId") for plugin in authoring_plugins}
    instance_ids = {plugin.get("id") for plugin in authoring_plugins}

    assert "conversation-thread-list" not in plugin_ids
    assert "conversation-thread-list-main" not in instance_ids
    assert model["root"]["type"] == "row"
    assert len(model["root"]["children"]) == 1
    assert "conversation-surface" in plugin_ids
    assert "agent-conversation-surface-main" in instance_ids
    assert "conversation-service" in plugin_ids
    assert (project_root / "services" / "conversations.ts").read_bytes() == service_before
    assert _source_snapshot(project_root, SURFACE_PLUGIN_ROOT) == surface_before

    metrics = result.change_layer_metrics
    _assert_fast_path_slo(result)
    assert result.project_control.requestsByOperation.get("inspect_ui_services", 0) == 0
    _LIVE_RUN_METRICS.append(
        (result.metrics.modelCalls, metrics["projectControlReads"])
    )
    assert metrics["executedChangeLayer"] == "composition"
    assert metrics["executedChangeLayers"] == ["composition"]
    assert metrics["appUIModelMutationAttempts"] == 1
    assert metrics["successfulAppUIModelMutations"] == 1
    assert result.app_ui_model_mutations.operationsPerMutation == [2]
    assert metrics["sourceWrites"] == 0
    assert metrics["crossLayerTransitionCount"] == 0
    assert metrics["semanticReplans"] == 0
    assert metrics["skillsLoaded"] and "app-ui-model" in metrics["skillsLoaded"]
    assert "app-ui-model" in metrics["scopeResources"]
    assert "plugin-instance:conversation-thread-list-main" in metrics[
        "scopeResources"
    ]
    assert "plugin:conversation-surface" not in metrics["scopeResources"]
    assert "service:ConversationService" not in metrics["scopeResources"]
    assert receipt["verification"]["status"] == "changed-and-verified"
    assert all(
        check["status"] == "passed" for check in receipt["verification"]["checks"]
    )
    assert all(check["status"] == "passed" for check in receipt["validations"])
    assert result.metrics.modelCalls <= 8
    assert metrics["projectControlReads"] <= 3


@pytest.mark.live_model
@pytest.mark.skipif(
    os.environ.get("CREATOR_RUN_LIVE_MODEL") != "1",
    reason="Set CREATOR_RUN_LIVE_MODEL=1 to run live Creator cognition.",
)
@pytest.mark.parametrize("repeat", range(3))
def test_live_theme_switch_reuses_existing_capability(tmp_path, repeat):
    project_root = _copy_target(tmp_path)
    _set_thread_list_fixture(project_root, enabled=False)
    _set_theme_switch_fixture(project_root, enabled=False)
    plugin_sources_before = _source_snapshot(project_root, "plugins")
    services_before = _source_snapshot(project_root, "services")
    agent_ui_before = _source_snapshot(project_root, "agent-ui")
    agent_contract_before = _source_snapshot(project_root, "agent-contract")
    thread_id = f"live-composition-theme-switch-{repeat}"
    agent, activity, logger = _create_live_agent(project_root, thread_id)

    result = _run_live_prompt(agent, CASE_C_PROMPT, case="C", repeat=repeat)
    receipt = _finish_live_run(
        case="C",
        repeat=repeat,
        prompt=CASE_C_PROMPT,
        result=result,
        activity=activity,
        logger=logger,
    )
    model = json.loads(
        (project_root / APP_UI_MODEL_PATH).read_text(encoding="utf-8")
    )
    plugin_ids = {
        plugin.get("pluginId") for plugin in _walk_authoring_plugins(model)
    }

    assert "theme-switch" in plugin_ids
    assert "theme-provider" in plugin_ids
    assert _source_snapshot(project_root, "plugins") == plugin_sources_before
    assert _source_snapshot(project_root, "services") == services_before
    assert _source_snapshot(project_root, "agent-ui") == agent_ui_before
    assert _source_snapshot(project_root, "agent-contract") == agent_contract_before

    metrics = result.change_layer_metrics
    _assert_fast_path_slo(result)
    assert result.project_control.requestsByOperation.get("inspect_ui_services", 0) == 0
    assert metrics["executedChangeLayer"] == "composition"
    assert metrics["executedChangeLayers"] == ["composition"]
    assert metrics["appUIModelMutationAttempts"] == 1
    assert metrics["successfulAppUIModelMutations"] == 1
    assert metrics["sourceWrites"] == 0
    assert metrics["semanticReplans"] == 0
    _LIVE_RUN_METRICS.append(
        (result.metrics.modelCalls, metrics["projectControlReads"])
    )
    assert receipt["verification"]["status"] == "changed-and-verified"


@pytest.mark.live_model
@pytest.mark.skipif(
    os.environ.get("CREATOR_RUN_LIVE_MODEL") != "1",
    reason="Set CREATOR_RUN_LIVE_MODEL=1 to run live Creator cognition.",
)
def test_live_behavior_request_enters_plugin_layer(tmp_path):
    project_root = _copy_target(tmp_path)
    _set_thread_list_fixture(project_root, enabled=True)
    thread_id = "live-plugin-behavior-history-list"
    agent, activity, logger = _create_live_agent(project_root, thread_id)

    result = _run_live_prompt(agent, CASE_D_PROMPT, case="D", repeat=0)
    _finish_live_run(
        case="D",
        repeat=0,
        prompt=CASE_D_PROMPT,
        result=result,
        activity=activity,
        logger=logger,
    )
    metrics = result.change_layer_metrics
    behavior_reads = sum(
        result.project_control.requestsByOperation.get(operation, 0)
        for operation in (
            "inspect_ui_plugin",
            "inspect_ui_plugin_source_references",
        )
    )

    assert behavior_reads > 0 or metrics["sourceWrites"] > 0
    assert metrics["executedChangeLayer"] in {
        "plugin_behavior",
        "mixed",
        "none",
    }
    assert metrics["executedChangeLayer"] != "composition"


@pytest.mark.live_model
@pytest.mark.skipif(
    os.environ.get("CREATOR_RUN_LIVE_MODEL") != "1",
    reason="Set CREATOR_RUN_LIVE_MODEL=1 to run live Creator cognition.",
)
def test_live_hybrid_request_does_not_stop_at_composition(tmp_path):
    project_root = _copy_target(tmp_path)
    _set_thread_list_fixture(project_root, enabled=False)
    thread_id = "live-hybrid-conversation-search"
    agent, activity, logger = _create_live_agent(project_root, thread_id)

    result = _run_live_prompt(agent, CASE_E_PROMPT, case="E", repeat=0)
    _finish_live_run(
        case="E",
        repeat=0,
        prompt=CASE_E_PROMPT,
        result=result,
        activity=activity,
        logger=logger,
    )
    metrics = result.change_layer_metrics
    behavior_reads = sum(
        result.project_control.requestsByOperation.get(operation, 0)
        for operation in (
            "inspect_ui_plugin",
            "inspect_ui_plugin_source_references",
        )
    )

    assert behavior_reads > 0 or "plugin_behavior" in metrics["attemptedChangeLayers"]
    assert metrics["executedChangeLayer"] in {
        "plugin_behavior",
        "mixed",
        "none",
    }
    assert metrics["executedChangeLayer"] != "composition"
