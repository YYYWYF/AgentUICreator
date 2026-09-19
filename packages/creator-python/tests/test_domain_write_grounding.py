"""Prompt contract and scripted integration regressions, not live-model intent evals.

The scripts exercise the real Domain Write graph, tools, receipts and server.
They check that the grounding policy reaches the model and that compliant tool
traces can clarify or write without an extra resolution run.
"""

from __future__ import annotations

import asyncio
import copy
import json

import pytest
from fastapi.testclient import TestClient
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from pydantic import Field

from agent_ui_creator.config import CreatorServerSettings
from agent_ui_creator.domain_agent import (
    create_domain_read_creator_agent,
    create_domain_write_creator_agent,
)
from agent_ui_creator.domain_agent.prompt import DOMAIN_READ_AGENT_PROMPT, DOMAIN_WRITE_AGENT_PROMPT
from agent_ui_creator.domain_agent.grounding_convergence import (
    COMPOSITION_POST_MUTATION_TOOL_NAMES,
    COMPOSITION_PRE_MUTATION_TOOL_NAMES,
)
from agent_ui_creator.domain_agent.tool_policy import ALLOWED_DOMAIN_WRITE_TOOLS
from agent_ui_creator.files import read_creator_file_state
from agent_ui_creator.model_protocol.errors import AgentNoProgressError
from agent_ui_creator.model_settings import CreatorModelSettings
from agent_ui_creator.project_control import ProjectControlMetrics
from agent_ui_creator.server import create_app

APP_UI_MODEL_PATH = "app-ui/app-ui.json"
REGISTRY_PATH = "plugins/registry.generated.ts"
QUESTION = "项目已有 session-manager，但尚未挂载。你希望恢复它，还是新建独立的历史会话插件？"


class GroundingScriptModel(FakeMessagesListChatModel):
    seen_messages: list = Field(default_factory=list)
    bound_tool_names: list[tuple[str, ...]] = Field(default_factory=list)
    expected_system_prompt: str = DOMAIN_WRITE_AGENT_PROMPT

    def bind_tools(self, tools, **kwargs):
        self.bound_tool_names.append(
            tuple(str(getattr(tool, "name", "") or "") for tool in tools)
        )
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        # Fail instead of silently cycling if the harness adds a model pass.
        assert len(self.seen_messages) < len(self.responses)
        system = "\n".join(
            str(message.content)
            for message in messages
            if isinstance(message, SystemMessage)
        )
        assert self.expected_system_prompt in system
        self.seen_messages.append(list(messages))
        return super()._generate(messages, stop=stop, run_manager=run_manager, **kwargs)


def call(name, arguments, call_id):
    return AIMessage(
        content="",
        tool_calls=[{"name": name, "args": arguments, "id": call_id}],
    )


class GroundingClient:
    """Small authoritative ProjectControl fixture with real mutation receipts."""

    def __init__(self, root, plugin_ids=("session-manager",)):
        self.root = root
        self.plugin_ids = plugin_ids
        self.metrics = ProjectControlMetrics()
        self.reads = []
        self.mutations = []
        (root / "app-ui").mkdir()
        (root / "plugins").mkdir()
        (root / APP_UI_MODEL_PATH).write_text(
            json.dumps(
                {
                    "applicationPlugins": [],
                    "root": {
                        "type": "row",
                        "id": "workspace",
                        "children": [
                            {
                                "type": "slot",
                                "id": "sidebar-left",
                                "description": "Left sidebar content.",
                                "plugins": [],
                            },
                            {
                                "type": "slot",
                                "id": "sidebar-right",
                                "description": "Right sidebar content.",
                                "plugins": [],
                            },
                        ],
                    },
                }
            )
            + "\n",
            encoding="utf-8",
        )
        (root / REGISTRY_PATH).write_text(
            "export const pluginDefinitions = [];\n", encoding="utf-8"
        )

    def model(self):
        return json.loads((self.root / APP_UI_MODEL_PATH).read_text(encoding="utf-8"))

    def hash(self):
        return read_creator_file_state(self.root, APP_UI_MODEL_PATH).hash

    def record(self, name, arguments=None):
        self.reads.append((name, arguments or {}))
        self.metrics.record(name, 1, False)

    async def list_ui_plugins(self):
        self.record("list_ui_plugins")
        plugins = authoring_plugins(self.model())
        selected_plugin_ids = sorted({plugin["pluginId"] for plugin in plugins})
        return {
            "appUIModelHash": self.hash(),
            "capabilityCatalog": {
                "revision": "a" * 64,
                "pluginIds": self.plugin_ids,
                "generatedFileFresh": True,
            },
            "activeComposition": {
                "resolvedPluginIds": selected_plugin_ids,
                "selectedPluginIds": selected_plugin_ids,
            },
            "issues": [],
            "pluginAssets": [
                {
                    "pluginId": plugin_id,
                    "directory": plugin_id,
                    "selected": plugin_id in selected_plugin_ids,
                }
                for plugin_id in self.plugin_ids
            ],
            "plugins": plugins,
            "catalogs": [],
        }

    async def inspect_ui_slots(self, *, root=None):
        self.record("inspect_ui_slots", {"root": root})
        return {
            "appUIModelHash": self.hash(),
            "slots": [
                {
                    "target": {"type": "layout_slot", "slotNodeId": "sidebar-right"},
                    "description": "Right sidebar content.",
                    "cardinality": "many",
                    "optional": True,
                    "plugins": [],
                }
            ],
        }

    async def inspect_ui_project(self, *, view=None):
        self.record(
            "inspect_ui_project",
            {"view": "composition"} if view == "composition" else {},
        )
        if view != "composition":
            return {
                "project": {"uiLibrary": "test"},
                "appUIModel": {"hash": self.hash()},
            }
        plugins = authoring_plugins(self.model())
        selected_plugin_ids = sorted({plugin["pluginId"] for plugin in plugins})
        return {
            "view": "composition",
            "observationCoverage": [
                "composition.model",
                "composition.layout",
                "composition.slots",
                "composition.instances",
                "capability.inventory",
                "capability.composition-summary",
                "creator.actions",
            ],
            "appUIModel": {
                "hash": self.hash(),
                "layout": {
                    "nodeRef": "l0",
                    "type": "row",
                    "children": [
                        {"nodeRef": "l1", "type": "slot", "plugins": []},
                        {"nodeRef": "l2", "type": "slot", "plugins": []},
                    ],
                },
                "slots": [
                    {
                        "target": {"type": "layout_slot", "slotRef": "l2"},
                        "nodeRef": "l2",
                        "plugins": [],
                    }
                ],
            },
            "pluginInstances": plugins,
            "capabilitySummaries": [
                {
                    "pluginId": plugin_id,
                    "name": plugin_id,
                    "description": f"{plugin_id} capability",
                    "capabilities": ["conversation-management"],
                    "selected": plugin_id in selected_plugin_ids,
                    "currentInstances": [],
                    "selectionOwner": "composition",
                    "authoring": {
                        "intents": ["add conversation management"],
                        "visualRole": "conversation navigation",
                    },
                    "requiredServices": {
                        "names": [],
                        "status": "not-required",
                        "missing": [],
                    },
                    "optionalServices": {"names": [], "available": []},
                }
                for plugin_id in self.plugin_ids
            ],
            "activeComposition": {
                "resolvedPluginIds": selected_plugin_ids,
                "selectedPluginIds": selected_plugin_ids,
                "headlessPluginIds": [],
            },
            "capabilityCatalogRevision": "a" * 64,
            "layoutConstraints": {
                "refs": "snapshot-scoped",
                "pluginTargets": ["application", "layout_slot", "plugin_slot"],
                "sizedContainerInsertion": {
                    "rule": "size-required",
                    "operations": [
                        "insert_layout_node",
                        "move_layout_node",
                        "insert_layout_relative",
                    ],
                },
                "relativeWrapperSizing": {
                    "rule": "size-and-anchorSize-together",
                    "operation": "insert_layout_relative",
                },
                "operationApplication": "sequential-atomic",
            },
            "hostGuarantees": {
                "mutation": "mutate_app_ui_model",
                "admission": "deterministic-atomic",
                "checks": [
                    "app-ui-model-hash",
                    "operation-and-model-schema",
                    "capability-and-definition-resolution",
                    "active-composition-compile",
                    "layout-width-compatibility",
                    "plugin-child-slot-contract",
                ],
                "commit": "all-or-nothing",
                "postCommitVerificationRequired": True,
                "guidance": "Do not preflight covered admission checks.",
            },
        }

    async def inspect_app_ui_model(self):
        raise AssertionError("The plugin/slot observations already provide the hash")

    async def inspect_ui_plugin(self, plugin_id):
        self.record("inspect_ui_plugin", {"pluginId": plugin_id})
        return {"pluginId": plugin_id, "entry": "index.ts"}

    async def inspect_ui_plugin_source_references(self, plugin_id):
        self.record(
            "inspect_ui_plugin_source_references",
            {"pluginId": plugin_id},
        )
        return {
            "pluginId": plugin_id,
            "files": [f"plugins/{plugin_id}/index.ts"],
        }

    async def inspect_ui_services(self):
        self.record("inspect_ui_services")
        return {
            "appUIModelHash": self.hash(),
            "services": [{"name": "ConversationService"}],
            "plugins": [],
            "issues": [],
        }

    async def request_app_ui_model_mutation(self, input):
        assert input["appUIModelHash"] == self.hash()
        self.mutations.append(input)
        self.metrics.record("mutate_app_ui_model", 1, False)
        before_hash = self.hash()
        model = self.model()
        for operation in input["operations"]:
            apply_authoring_operation(model, operation)
        (self.root / APP_UI_MODEL_PATH).write_text(
            json.dumps(model) + "\n", encoding="utf-8"
        )
        return {
            "schemaVersion": 1,
            "transactionId": "restore-session",
            "changed": True,
            "changedPaths": [APP_UI_MODEL_PATH],
            "appUIModel": {"beforeHash": before_hash, "afterHash": self.hash()},
            "snapshotToken": {
                "appUIModelHash": self.hash(),
                "capabilityCatalogSourceHash": read_creator_file_state(
                    self.root, REGISTRY_PATH
                ).hash,
            },
        }


def layout_slot(model, slot_node_id):
    def visit(node):
        if node["type"] == "slot":
            return node if node["id"] == slot_node_id else None
        if node["type"] == "panel":
            return visit(node["child"])
        for child in node["children"]:
            result = visit(child)
            if result is not None:
                return result
        return None

    result = visit(model["root"])
    if result is None:
        raise AssertionError(f"Unknown Layout Slot: {slot_node_id}")
    return result


def authoring_plugin_locations(model):
    result = []

    def visit_plugins(plugins, target):
        for plugin in plugins:
            result.append((plugin, plugins, target))
            for slot, children in plugin.get("slots", {}).items():
                visit_plugins(
                    children,
                    {
                        "type": "plugin_slot",
                        "parentInstanceId": plugin["id"],
                        "slot": slot,
                    },
                )

    visit_plugins(model.get("applicationPlugins", []), {"type": "application"})

    def visit_layout(node):
        if node["type"] == "slot":
            visit_plugins(
                node["plugins"],
                {"type": "layout_slot", "slotNodeId": node["id"]},
            )
        elif node["type"] == "panel":
            visit_layout(node["child"])
        else:
            for child in node["children"]:
                visit_layout(child)

    visit_layout(model["root"])
    return result


def authoring_plugins(model):
    return [plugin for plugin, _, _ in authoring_plugin_locations(model)]


def target_plugins(model, target):
    if target["type"] == "application":
        return model.setdefault("applicationPlugins", [])
    if target["type"] == "layout_slot":
        return layout_slot(model, target["slotNodeId"])["plugins"]
    parent = next(
        plugin
        for plugin, _, _ in authoring_plugin_locations(model)
        if plugin["id"] == target["parentInstanceId"]
    )
    return parent.setdefault("slots", {}).setdefault(target["slot"], [])


def apply_authoring_operation(model, operation):
    kind = operation["type"]
    if kind == "insert_plugin":
        plugins = target_plugins(model, operation["target"])
        plugins.insert(operation.get("index", len(plugins)), copy.deepcopy(operation["plugin"]))
        return
    location = next(
        (item for item in authoring_plugin_locations(model) if item[0]["id"] == operation.get("instanceId")),
        None,
    )
    if location is None:
        raise AssertionError(f"Unknown plugin instance: {operation.get('instanceId')}")
    plugin, current_plugins, _ = location
    if kind == "move_plugin":
        current_plugins.remove(plugin)
        plugins = target_plugins(model, operation["target"])
        plugins.insert(operation.get("index", len(plugins)), plugin)
    elif kind == "set_plugin_enabled":
        plugin["enabled"] = operation["enabled"]
    elif kind == "update_plugin_props":
        props = plugin.setdefault("props", {})
        props.update(copy.deepcopy(operation.get("set", {})))
        for key in operation.get("removeKeys", []):
            props.pop(key, None)
        if not props:
            plugin.pop("props", None)
    elif kind == "remove_plugin":
        current_plugins.remove(plugin)
    elif kind == "replace_plugin":
        current_plugins[current_plugins.index(plugin)] = copy.deepcopy(operation["replacement"])
    else:
        raise AssertionError(f"Unexpected scripted operation: {kind}")


def project_files(root):
    # Creator's own receipts/logs are not generated-project mutations.
    return {
        path.relative_to(root).as_posix(): path.read_bytes()
        for directory in ("app-ui", "plugins")
        for path in (root / directory).rglob("*")
        if path.is_file()
    }


def run_script(client, prompt, responses):
    model = GroundingScriptModel(responses=responses)
    agent = create_domain_write_creator_agent(
        model=model, workspace=client.root, project_control=client
    )
    result = asyncio.run(
        agent.run(prompt) if isinstance(prompt, str) else agent.run_messages(prompt)
    )
    receipt = agent.activity.finish()
    assert result.metrics.modelCalls == len(responses) == len(model.seen_messages)
    assert result.repeated_project_control_reads == 0
    assert result.metrics.repeatedToolLoops == 0
    return result, receipt, model


def test_grounding_prompt_preserves_decision_and_write_boundaries():
    prompt = " ".join(DOMAIN_WRITE_AGENT_PROMPT.split())
    for rule in (
        "Before the first side-effecting operation",
        "Reuse -> Restore -> Reconfigure -> Modify -> Create",
        "two or more reasonable interpretations",
        "materially different side effects",
        "do not call edit_file, create_ui_plugin, mutate_ui_plugin_source, mutate_app_ui_model",
        "successful assistant response, not an error",
        "Do not ask for confirmation when the target and operation are sufficiently clear",
        "new independent plugin must not be blocked",
        "A user's explicit correction supersedes every previous interpretation or plan",
        'inspect_ui_project(view="composition")',
        "the default convergence boundary",
        "positive user intents, visual role, typical placement",
        "hostGuarantees.postCommitVerificationRequired",
        "When requiredServices.status is resolved",
        "Do not preflight checks listed in hostGuarantees",
        "OBSERVATION_ALREADY_COVERED",
        "Do not repeat the same ProjectControl inspection while the workspace is unchanged",
        "request the smallest targeted cross-layer read",
        "explicit exit signal",
        "restores the full tool surface on the next model call",
        "inspect_ui_project() without a view is already available",
        "likewise explicitly exits the Composition fast path",
        "Do not add a separate intent model call",
        "Never edit app-ui/app-ui.json,",
        "app-ui/composition-revision.generated.json, or plugins/registry.generated.ts",
        "smallest determinable atomic mutation",
        "stale refreshes do not consume the one allowed semantic replan",
        "Use the smallest set of layers necessary to satisfy the user's desired final state",
        "concrete validation evidence proves that a defect introduced by this run",
        "Pre-existing diagnostics that remain unchanged",
        "workspace warnings, not task blockers",
        "Creator is a domain-aware coding agent",
        "Use clean mode only for requests to fix all current typecheck errors, make typecheck clean, or make the project's TypeScript validation pass with no remaining diagnostics",
        "For a fix targeting one or a finite set of explicitly identified pre-existing diagnostics, continue using delta mode",
        "Before completion, confirm that every requested diagnostic appears in resolved diagnostics or is no longer present",
        "Do not add a third validation mode or a target-diagnostic workflow",
        "request those two independent reads together",
        "/skills/ui-layout/SKILL.md as the third read",
    ):
        assert rule in prompt


def test_validation_mode_prompt_narrows_clean_mode_to_workspace_clean_requests():
    prompt = " ".join(DOMAIN_WRITE_AGENT_PROMPT.split())

    assert (
        "Use clean mode only for requests to fix all current typecheck errors, "
        "make typecheck clean, or make the project's TypeScript validation pass "
        "with no remaining diagnostics"
    ) in prompt
    assert (
        "For a fix targeting one or a finite set of explicitly identified "
        "pre-existing diagnostics, continue using delta mode"
    ) in prompt
    assert (
        "Before completion, confirm that every requested diagnostic appears in "
        "resolved diagnostics or is no longer present"
    ) in prompt
    assert "Do not add a third validation mode or a target-diagnostic workflow" in prompt
    assert (
        "Use clean mode when the user's desired state includes fixing existing "
        "diagnostics"
    ) not in prompt


@pytest.mark.parametrize(
    ("plugin_ids", "prompt", "question"),
    [
        (("session-manager",), "我要历史会话功能", QUESTION),
        (
            ("session-manager", "conversation-history"),
            "把会话插件恢复回来。",
            "项目有 session-manager 和 conversation-history，你要恢复哪一个？",
        ),
    ],
    ids=["A-restore-or-create", "D-two-targets"],
)
def test_ambiguity_finishes_after_one_read_without_writes(
    tmp_path, plugin_ids, prompt, question
):
    client = GroundingClient(tmp_path, plugin_ids)
    before = project_files(tmp_path)
    result, receipt, model = run_script(
        client, prompt,
        [call("list_ui_plugins", {}, "plugins-1"), AIMessage(content=question)],
    )

    assert result.text == question
    assert [item.name for item in result.activities] == ["list_ui_plugins"]
    assert client.reads == [("list_ui_plugins", {})]
    assert client.mutations == []
    assert result.app_ui_model_mutations.requests == 0
    assert result.app_ui_model_mutations.changedPaths == 0
    assert receipt["files"] == []
    assert project_files(tmp_path) == before
    observation = next(
        message for message in model.seen_messages[-1]
        if isinstance(message, ToolMessage)
    )
    facts = json.loads(observation.content)["result"]
    assert [asset["pluginId"] for asset in facts["pluginAssets"]] == list(plugin_ids)
    assert facts["plugins"] == []


@pytest.mark.parametrize(
    "prompt",
    [
        "把已有的会话管理插件恢复到右侧栏。",
        [
            {"role": "user", "content": "我要历史会话功能。"},
            {"role": "assistant", "content": "准备新建独立的历史会话插件。"},
            {"role": "user", "content": "不是，是恢复以前那个会话管理插件，放回右侧栏。"},
        ],
    ],
    ids=["B-explicit-restore", "E-correction-supersedes-creation"],
)
def test_clear_restore_and_correction_use_one_atomic_mutation(tmp_path, prompt):
    client = GroundingClient(tmp_path)
    operation = {
        "type": "insert_plugin",
        "plugin": {
            "id": "session-manager-main",
            "pluginId": "session-manager",
            "enabled": True,
        },
        "target": {"type": "layout_slot", "slotNodeId": "sidebar-right"},
    }
    result, receipt, model = run_script(
        client, prompt,
        [
            call("list_ui_plugins", {}, "plugins-1"),
            call("inspect_ui_slots", {}, "slots-1"),
            call("mutate_app_ui_model", {"operations": [operation]}, "restore-1"),
            AIMessage(content="已恢复现有会话管理插件到右侧栏；尚未进行运行时验证。"),
        ],
    )

    assert [item.name for item in result.activities] == [
        "list_ui_plugins", "inspect_ui_slots", "mutate_app_ui_model"
    ]
    assert client.mutations[0]["operations"] == [operation]
    assert len(client.mutations) == 1
    assert result.app_ui_model_mutations.requests == 1
    assert result.app_ui_model_mutations.resultMismatches == 0
    assert result.domain_observations.hashReuses == 1
    assert layout_slot(client.model(), "sidebar-right")["plugins"] == [
        operation["plugin"]
    ]
    assert [item["path"] for item in receipt["files"]] == [APP_UI_MODEL_PATH]
    assert "？" not in result.text
    if isinstance(prompt, str):
        assert any(message.content == prompt for message in model.seen_messages[0])
    else:
        conversation = [
            message for message in model.seen_messages[0]
            if isinstance(message, (HumanMessage, AIMessage))
        ]
        assert [type(message) for message in conversation] == [HumanMessage, AIMessage, HumanMessage]
        assert [message.content for message in conversation] == [item["content"] for item in prompt]


def test_composition_snapshot_converges_directly_to_atomic_mutation(tmp_path):
    client = GroundingClient(tmp_path)
    operation = {
        "type": "insert_plugin",
        "plugin": {
            "id": "session-manager-main",
            "pluginId": "session-manager",
            "enabled": True,
        },
        "target": {"type": "layout_slot", "slotNodeId": "sidebar-right"},
    }
    result, receipt, model = run_script(
        client,
        "把已有的会话管理能力放到右侧栏。",
        [
            call(
                "inspect_ui_project",
                {"view": "composition"},
                "composition-1",
            ),
            call(
                "mutate_app_ui_model",
                {"operations": [operation]},
                "mutation-1",
            ),
            AIMessage(content="已复用现有会话管理能力并更新右侧布局。"),
        ],
    )

    assert [item.name for item in result.activities] == [
        "inspect_ui_project",
        "mutate_app_ui_model",
    ]
    assert client.reads == [
        ("inspect_ui_project", {"view": "composition"})
    ]
    assert len(client.mutations) == 1
    assert receipt["verification"]["projectRevision"] == 1
    assert result.domain_observations.compositionGroundingUpdates == 1
    assert model.bound_tool_names[-2] == tuple(COMPOSITION_PRE_MUTATION_TOOL_NAMES)
    assert model.bound_tool_names[-1] == tuple(COMPOSITION_POST_MUTATION_TOOL_NAMES)
    control = [
        message
        for message in model.seen_messages[1]
        if isinstance(message, SystemMessage)
        and "Composition grounding is sufficient." in str(message.content)
    ]
    assert len(control) == 1
    assert result.composition_fast_path_metrics.to_dict() == {
        "attempted": True,
        "eligible": True,
        "compositionSnapshots": 1,
        "fastPathExits": 0,
        "modelCallsBeforeFirstMutation": 2,
        "readRoundsBeforeFirstMutation": 1,
        "readToolsBeforeFirstMutation": 1,
        "duplicateObservationAttempts": 0,
        "crossLayerReadAttemptsBeforeMutation": 0,
        "filesystemSourceReadsBeforeMutation": 0,
        "firstMutationSucceeded": True,
        "firstMutationErrorCode": None,
        "inputTokensBeforeFirstMutation": None,
        "modelLatencyBeforeFirstMutationMs": sum(
            trace.durationMs for trace in result.metrics.traces[:2]
        ),
    }


def test_full_project_exit_reenables_plugin_behavior_reads(tmp_path):
    client = GroundingClient(tmp_path)
    source = tmp_path / "plugins" / "session-manager" / "index.ts"
    source.parent.mkdir(parents=True)
    source.write_text("export const sessionManager = true;\n", encoding="utf-8")
    result, _receipt, model = run_script(
        client,
        "检查已有会话管理插件的实现。",
        [
            call("inspect_ui_project", {"view": "composition"}, "composition-1"),
            call("inspect_ui_project", {}, "full-project-1"),
            call(
                "inspect_ui_plugin",
                {"pluginId": "session-manager"},
                "plugin-1",
            ),
            call(
                "inspect_ui_plugin_source_references",
                {"pluginId": "session-manager"},
                "source-references-1",
            ),
            call(
                "read_file",
                {"file_path": "/plugins/session-manager/index.ts"},
                "read-allowed",
            ),
            AIMessage(content="已完成实现检查。"),
        ],
    )

    assert client.reads == [
        ("inspect_ui_project", {"view": "composition"}),
        ("inspect_ui_project", {}),
        ("inspect_ui_plugin", {"pluginId": "session-manager"}),
        (
            "inspect_ui_plugin_source_references",
            {"pluginId": "session-manager"},
        ),
    ]
    metrics = result.composition_fast_path_metrics.to_dict()
    assert metrics["fastPathExits"] == 1
    assert metrics["crossLayerReadAttemptsBeforeMutation"] == 0
    assert metrics["filesystemSourceReadsBeforeMutation"] == 0
    assert model.bound_tool_names[1] == tuple(COMPOSITION_PRE_MUTATION_TOOL_NAMES)
    assert set(model.bound_tool_names[2]) == set(ALLOWED_DOMAIN_WRITE_TOOLS)


def test_full_project_exit_reenables_runtime_capability_reads(tmp_path):
    client = GroundingClient(tmp_path)
    result, _receipt, model = run_script(
        client,
        "检查会话服务能力。",
        [
            call("inspect_ui_project", {"view": "composition"}, "composition-1"),
            call("inspect_ui_project", {}, "full-project-1"),
            call("inspect_ui_services", {}, "services-1"),
            AIMessage(content="已完成服务能力检查。"),
        ],
    )

    assert client.reads == [
        ("inspect_ui_project", {"view": "composition"}),
        ("inspect_ui_project", {}),
        ("inspect_ui_services", {}),
    ]
    metrics = result.composition_fast_path_metrics.to_dict()
    assert metrics["fastPathExits"] == 1
    assert metrics["crossLayerReadAttemptsBeforeMutation"] == 0
    assert model.bound_tool_names[1] == tuple(COMPOSITION_PRE_MUTATION_TOOL_NAMES)
    assert set(model.bound_tool_names[2]) == set(ALLOWED_DOMAIN_WRITE_TOOLS)


def test_explicit_independent_capability_can_enter_source_edit_path(tmp_path):
    client = GroundingClient(tmp_path)
    # Existing independent scaffold: exercise the available edit_file write path,
    # without adding a new file-creation tool to this phase's allowlist.
    scaffold = tmp_path / "plugins" / "independent-history.ts"
    scaffold.write_text('export const history = "TODO";\n', encoding="utf-8")
    before_model = (tmp_path / APP_UI_MODEL_PATH).read_bytes()
    result, receipt, _ = run_script(
        client,
        "不要使用现有会话插件，新建一个独立的历史会话插件，从 independent-history.ts 骨架开始。",
        [
            call("list_ui_plugins", {}, "plugins-1"),
            call("read_file", {"file_path": "/plugins/independent-history.ts"}, "read-1"),
            call(
                "edit_file",
                {
                    "file_path": "/plugins/independent-history.ts",
                    "old_string": '"TODO"',
                    "new_string": "[]",
                },
                "edit-1",
            ),
            AIMessage(content="已开始实现独立历史会话插件，完成骨架中的历史数据初始化。"),
        ],
    )

    assert [item.name for item in result.activities] == [
        "list_ui_plugins", "read_file", "edit_file"
    ]
    assert scaffold.read_text(encoding="utf-8") == "export const history = [];\n"
    assert [item["path"] for item in receipt["files"]] == ["plugins/independent-history.ts"]
    assert client.mutations == []
    assert (tmp_path / APP_UI_MODEL_PATH).read_bytes() == before_model
    assert "？" not in result.text


def test_clear_conversational_request_does_not_preload_workspace(tmp_path):
    client = GroundingClient(tmp_path)
    result, receipt, _ = run_script(
        client, "你好", [AIMessage(content="你好，请描述你希望调整的界面。")]
    )
    assert result.metrics.modelCalls == 1
    assert result.metrics.toolCalls == 0
    assert client.reads == []
    assert receipt["files"] == []


@pytest.mark.parametrize("mode", ["domain-read", "domain-write"])
@pytest.mark.parametrize("reply", ["第一个", "A"])
def test_domain_messages_preserve_clarification_roles_without_extra_calls(tmp_path, mode, reply):
    client = GroundingClient(tmp_path)
    messages = [
        {"role": "user", "content": "我要历史会话功能"},
        {"role": "assistant", "content": "A 是恢复 session-manager，B 是创建新插件，你选哪个？"},
        {"role": "user", "content": reply},
    ]
    model = GroundingScriptModel(
        responses=[AIMessage(content="明白，你选择恢复已有插件。")],
        expected_system_prompt=DOMAIN_READ_AGENT_PROMPT if mode == "domain-read" else DOMAIN_WRITE_AGENT_PROMPT,
    )
    factory = create_domain_read_creator_agent if mode == "domain-read" else create_domain_write_creator_agent
    agent = factory(model=model, workspace=tmp_path, project_control=client)

    result = asyncio.run(agent.run_messages(messages))

    conversation = [
        message for message in model.seen_messages[0]
        if isinstance(message, (HumanMessage, AIMessage))
    ]
    assert [type(message) for message in conversation] == [HumanMessage, AIMessage, HumanMessage]
    assert [message.content for message in conversation] == [item["content"] for item in messages]
    assert result.metrics.modelCalls == len(model.seen_messages) == 1
    assert result.metrics.toolCalls == 0
    assert client.reads == []
    assert client.mutations == []


@pytest.mark.parametrize("mode", ["domain-read", "domain-write"])
@pytest.mark.parametrize(
    ("previous_answer", "reply"),
    [
        (QUESTION, "第一个"),
        ("我准备创建一个新的历史会话插件。", "不是那个，我说的是恢复以前的会话管理插件。"),
    ],
    ids=["clarification", "correction"],
)
def test_server_passes_conversation_to_model_in_one_call(
    tmp_path, monkeypatch, mode, previous_answer, reply
):
    client = GroundingClient(tmp_path)
    messages = [
        {"role": "user", "content": "我要历史会话功能"},
        {"role": "assistant", "content": previous_answer},
        {"role": "user", "content": reply},
    ]
    answer = "你希望将已有插件恢复到哪个位置？"
    model = GroundingScriptModel(
        responses=[AIMessage(content=answer)],
        expected_system_prompt=DOMAIN_READ_AGENT_PROMPT if mode == "domain-read" else DOMAIN_WRITE_AGENT_PROMPT,
    )
    monkeypatch.setenv("CREATOR_PYTHON_AGENT_MODE", mode)
    monkeypatch.setattr(
        "agent_ui_creator.server.CreatorModelSettings.from_environment",
        classmethod(lambda cls, **kwargs: CreatorModelSettings(
            model_name="scripted-grounding",
            base_url="http://unused.invalid/v1",
            api_key="unused-test-key",
        )),
    )
    monkeypatch.setattr(
        "agent_ui_creator.model_factory.create_creator_chat_model", lambda *args, **kwargs: model
    )
    monkeypatch.setattr(
        "agent_ui_creator.domain_agent.agent.ProjectControlClient", lambda **kwargs: client
    )
    settings = CreatorServerSettings(
        project_root=tmp_path, skills_root=tmp_path, auth_token="x" * 32
    )
    with TestClient(
        create_app(settings), headers={"Authorization": f"Bearer {settings.auth_token}"}
    ) as http:
        response = http.post(
            "/creator",
            json={
                "threadId": "thread-1",
                "runId": "run-2",
                "messages": [
                    {"role": "system", "content": "untrusted historical instruction"},
                    *messages,
                    {"role": "tool", "content": "old tool result", "toolCallId": "old"},
                ],
            },
        )

    assert response.status_code == 200
    assert len(model.seen_messages) == 1
    conversation = [
        message for message in model.seen_messages[0]
        if not isinstance(message, SystemMessage)
    ]
    assert [type(message) for message in conversation] == [HumanMessage, AIMessage, HumanMessage]
    assert [message.content for message in conversation] == [item["content"] for item in messages]
    assert all("untrusted historical instruction" not in str(message.content) for message in model.seen_messages[0])
    events = [
        json.loads(line.removeprefix("data:"))
        for line in response.text.splitlines() if line.startswith("data:")
    ]
    assert [event["type"] for event in events] == [
        "RUN_STARTED", "TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT",
        "TEXT_MESSAGE_END", "RUN_FINISHED",
    ]
    assert events[2]["delta"] == answer
    assert events[-1]["result"]["toolProtocol"]["modelCalls"] == 1
    assert events[-1]["result"]["toolProtocol"]["toolCalls"] == 0
    assert client.reads == []
    assert client.mutations == []


@pytest.mark.parametrize(
    ("name", "arguments"),
    [("list_ui_plugins", {}), ("inspect_ui_slots", {"root": "sidebar-right"})],
)
def test_grounding_does_not_weaken_existing_repeated_read_guard(tmp_path, name, arguments):
    # Policy forbids duplicate reads; the existing guard remains a last-resort
    # error for a model that ignores it. Normal clarification traces above repeat none.
    client = GroundingClient(tmp_path)
    model = GroundingScriptModel(
        responses=[call(name, arguments, f"repeat-{index}") for index in range(3)]
    )
    agent = create_domain_write_creator_agent(
        model=model, workspace=tmp_path, project_control=client
    )
    before = project_files(tmp_path)
    with pytest.raises(AgentNoProgressError):
        asyncio.run(agent.run("重复相同检查。"))
    assert len(client.reads) == 2
    assert agent.repeated_read_guard.repeated_reads == 2
    assert client.mutations == []
    assert project_files(tmp_path) == before


def test_server_clarification_stream_succeeds_with_zero_mutations(tmp_path, monkeypatch):
    client = GroundingClient(tmp_path)
    before = project_files(tmp_path)
    model = GroundingScriptModel(
        responses=[call("list_ui_plugins", {}, "plugins-1"), AIMessage(content=QUESTION)]
    )
    model_creations = []

    def create_model(*args, **kwargs):
        model_creations.append(True)
        return model

    monkeypatch.setenv("CREATOR_PYTHON_AGENT_MODE", "domain-write")
    monkeypatch.setattr(
        "agent_ui_creator.server.CreatorModelSettings.from_environment",
        classmethod(lambda cls, **kwargs: CreatorModelSettings(
            model_name="scripted-grounding",
            base_url="http://unused.invalid/v1",
            api_key="unused-test-key",
        )),
    )
    monkeypatch.setattr("agent_ui_creator.model_factory.create_creator_chat_model", create_model)
    monkeypatch.setattr(
        "agent_ui_creator.domain_agent.agent.ProjectControlClient", lambda **kwargs: client
    )
    settings = CreatorServerSettings(
        project_root=tmp_path, skills_root=tmp_path, auth_token="x" * 32
    )
    with TestClient(
        create_app(settings), headers={"Authorization": f"Bearer {settings.auth_token}"}
    ) as http:
        response = http.post(
            "/creator",
            json={
                "threadId": "grounding-thread",
                "runId": "clarification-run",
                "messages": [{"role": "user", "content": "我要历史会话功能"}],
            },
        )

    assert response.status_code == 200
    events = [
        json.loads(line.removeprefix("data:"))
        for line in response.text.splitlines() if line.startswith("data:")
    ]
    assert events[0]["type"] == "RUN_STARTED"
    assert events[-1]["type"] == "RUN_FINISHED"
    assert not any(event["type"] == "RUN_ERROR" for event in events)
    assert {event["type"] for event in events} <= {
        "RUN_STARTED", "RUN_FINISHED", "TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT",
        "TEXT_MESSAGE_END", "TOOL_CALL_START", "TOOL_CALL_ARGS", "TOOL_CALL_END",
        "TOOL_CALL_RESULT",
    }
    assert "".join(
        event["delta"] for event in events if event["type"] == "TEXT_MESSAGE_CONTENT"
    ) == QUESTION
    assert events[-1]["outcome"]["type"] == "success"
    result = events[-1]["result"]
    assert result["appUIModelMutations"]["requests"] == 0
    assert result["appUIModelMutations"]["changedPaths"] == 0
    assert result["receipt"]["files"] == []
    assert result["projectControl"]["repeatedProjectControlReads"] == 0
    assert result["toolProtocol"]["modelCalls"] == 2
    assert result["toolProtocol"]["toolCalls"] == 1
    assert result["compositionFastPath"]["attempted"] is False
    assert len(model_creations) == 1
    assert client.mutations == []
    assert project_files(tmp_path) == before
