from __future__ import annotations

import asyncio
import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from statistics import median
from urllib.parse import quote

import pytest

from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.domain_agent import create_domain_write_creator_agent
from agent_ui_creator.files import read_creator_file_state
from agent_ui_creator.model_factory import create_creator_chat_model
from agent_ui_creator.model_protocol.provider_trace import ProviderResponseTraceCollector
from agent_ui_creator.model_settings import CreatorModelSettings
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
PROMPT = "帮我去掉左边的历史会话"
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


@pytest.mark.live_model
@pytest.mark.skipif(
    os.environ.get("CREATOR_RUN_LIVE_MODEL") != "1",
    reason="Set CREATOR_RUN_LIVE_MODEL=1 to run live Creator cognition.",
)
@pytest.mark.parametrize("repeat", range(3))
def test_live_composition_cognition_is_resource_scoped(tmp_path, repeat):
    project_root = _copy_target(tmp_path)
    surface_before = _source_snapshot(project_root, SURFACE_PLUGIN_ROOT)
    service_before = (project_root / "services" / "conversations.ts").read_bytes()
    thread_id = f"live-composition-cognition-{repeat}"
    diagnostics = RuntimeDiagnosticStore()
    activity = CreatorActivityRecorder(project_root)
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

    result = asyncio.run(agent.run(PROMPT))
    receipt = activity.finish()
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
