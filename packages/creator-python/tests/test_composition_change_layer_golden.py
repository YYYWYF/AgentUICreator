"""Scripted Creator graph regressions for canonical Composition requests.

These tests exercise the real Domain Write graph, Skill loading, Host mutation
service, validation tool, Runtime inspection, receipts, and change-layer metrics.
They are not live-model intent or latency evidence.
"""

from __future__ import annotations

import asyncio
import copy
import json
from datetime import datetime, timezone
from pathlib import Path

import pytest
from langchain_core.messages import AIMessage

from agent_ui_creator.domain_agent import create_domain_write_creator_agent
from agent_ui_creator.files import read_creator_file_state
from agent_ui_creator.project_control import ProjectControlMetrics
from agent_ui_creator.runtime_diagnostics import (
    RuntimeDiagnosticEnvelope,
    RuntimeDiagnosticStore,
)
from agent_ui_creator.validation import CommandExecutionResult

from test_domain_write_grounding import GroundingScriptModel, call


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
SKILLS_ROOT = REPOSITORY_ROOT / "creator" / "skills"
APP_UI_MODEL_PATH = "app-ui/app-ui.json"
REGISTRY_PATH = "plugins/registry.generated.ts"


def plugin(instance_id, plugin_id, *, enabled=True, slots=None):
    return {
        "id": instance_id,
        "pluginId": plugin_id,
        "enabled": enabled,
        **({"slots": slots} if slots is not None else {}),
    }


def initial_model():
    return {
        "applicationPlugins": [
            plugin("conversation-service-main", "conversation-service"),
        ],
        "root": {
            "type": "row",
            "sizes": ["18rem", "minmax(0, 1fr)"],
            "children": [
                {
                    "type": "panel",
                    "child": {
                        "type": "slot",
                        "plugins": [
                            plugin(
                                "conversation-thread-list-main",
                                "conversation-thread-list",
                            )
                        ],
                    },
                },
                {
                    "type": "panel",
                    "child": {
                        "type": "slot",
                        "plugins": [
                            plugin(
                                "conversation-surface-main",
                                "conversation-surface",
                                slots={
                                    "emptySuggestions": [
                                        plugin(
                                            "conversation-suggestions-main",
                                            "conversation-suggestions",
                                        )
                                    ]
                                },
                            )
                        ],
                    },
                },
            ],
        },
    }


def walk_plugins(model):
    result = []

    def visit_plugins(plugins, target):
        for item in plugins:
            result.append((item, plugins, target))
            for slot, children in item.get("slots", {}).items():
                visit_plugins(
                    children,
                    {
                        "type": "plugin_slot",
                        "parentInstanceId": item["id"],
                        "slot": slot,
                    },
                )

    visit_plugins(model.get("applicationPlugins", []), {"type": "application"})

    def visit_layout(node, ref_counter):
        current_ref = f"l{ref_counter[0]}"
        ref_counter[0] += 1
        if node["type"] == "slot":
            visit_plugins(
                node["plugins"],
                {"type": "layout_slot", "slotRef": current_ref},
            )
        elif node["type"] == "panel":
            visit_layout(node["child"], ref_counter)
        else:
            for child in node["children"]:
                visit_layout(child, ref_counter)

    visit_layout(model["root"], [0])
    return result


class CompositionClient:
    def __init__(self, root: Path, model: dict):
        self.root = root
        self.metrics = ProjectControlMetrics()
        self.mutations = []
        (root / "app-ui").mkdir()
        (root / "plugins").mkdir()
        (root / APP_UI_MODEL_PATH).write_text(
            json.dumps(model, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        (root / REGISTRY_PATH).write_text(
            "export const pluginDefinitions = [];\n", encoding="utf-8"
        )

    def model(self):
        return json.loads((self.root / APP_UI_MODEL_PATH).read_text(encoding="utf-8"))

    def hash(self):
        return read_creator_file_state(self.root, APP_UI_MODEL_PATH).hash

    async def inspect_ui_project(self):
        self.metrics.record("inspect_ui_project", 1, False)
        model = self.model()
        return {
            "appUIModel": {"hash": self.hash(), "model": model},
            "plugins": [
                {"id": item["id"], "pluginId": item["pluginId"], "target": target}
                for item, _container, target in walk_plugins(model)
            ],
        }

    async def list_ui_plugins(self):
        self.metrics.record("list_ui_plugins", 1, False)
        return {
            "appUIModelHash": self.hash(),
            "pluginAssets": [
                {
                    "pluginId": "theme-switch",
                    "description": "Switch the current application theme.",
                    "selected": False,
                }
            ],
        }

    async def request_app_ui_model_mutation(self, input):
        self.metrics.record("mutate_app_ui_model", 1, False)
        self.mutations.append(copy.deepcopy(input))
        assert input["appUIModelHash"] == self.hash()
        before_hash = self.hash()
        model = self.model()
        for operation in input["operations"]:
            self._apply(model, operation)
        (self.root / APP_UI_MODEL_PATH).write_text(
            json.dumps(model, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        return {
            "schemaVersion": 1,
            "transactionId": "composition-golden",
            "changed": before_hash != self.hash(),
            "changedPaths": [APP_UI_MODEL_PATH],
            "appUIModel": {"beforeHash": before_hash, "afterHash": self.hash()},
            "snapshotToken": {
                "appUIModelHash": self.hash(),
                "registryHash": read_creator_file_state(
                    self.root, REGISTRY_PATH
                ).hash,
            },
        }

    @staticmethod
    def _apply(model, operation):
        if operation["type"] in {"remove_plugin", "set_plugin_enabled"}:
            found = next(
                item
                for item in walk_plugins(model)
                if item[0]["id"] == operation["instanceId"]
            )
            current, container, _target = found
            if operation["type"] == "remove_plugin":
                container.remove(current)
            else:
                current["enabled"] = operation["enabled"]
            return
        if operation["type"] == "remove_layout_node":
            assert operation["nodeRef"] == "l1"
            model["root"]["children"].pop(0)
            model["root"]["sizes"].pop(0)
            return
        if operation["type"] == "insert_plugin":
            assert operation["target"] == {"type": "layout_slot", "slotRef": "l4"}
            model["root"]["children"][1]["child"]["plugins"].append(
                copy.deepcopy(operation["plugin"])
            )
            return
        raise AssertionError(operation)

    async def verify_runtime_composition(self, **_kwargs):
        self.metrics.record("verify_runtime_composition", 1, False)
        return {"verified": True, "checks": []}


class PassingValidation:
    def __init__(self, client, diagnostics):
        self.client = client
        self.diagnostics = diagnostics
        self.calls = []

    async def execute_known_command(self, command):
        self.calls.append(command)
        if command == "pnpm typecheck":
            instances = [
                {
                    "instanceId": item["id"],
                    "pluginId": item["pluginId"],
                    "slotId": f"authoring:{index}",
                }
                for index, (item, _container, target) in enumerate(
                    walk_plugins(self.client.model())
                )
                if target["type"] != "application" and item.get("enabled", True)
            ]
            self.diagnostics.record(
                RuntimeDiagnosticEnvelope.model_validate(
                    {
                        "threadId": "composition-golden",
                        "composition": {
                            "schemaVersion": 1,
                            "appUIModelHash": self.client.hash(),
                            "observedAt": datetime.now(timezone.utc).isoformat(),
                            "instances": instances,
                        },
                    }
                )
            )
        return CommandExecutionResult("", 0, False)


def scripted_responses(operations):
    needs_asset_discovery = any(
        operation.get("type") == "insert_plugin" for operation in operations
    )
    composition_reads = (
        AIMessage(
            content="",
            tool_calls=[
                {
                    "name": "list_ui_plugins",
                    "args": {},
                    "id": "discover-existing-assets",
                },
                {
                    "name": "inspect_ui_project",
                    "args": {},
                    "id": "inspect-current-composition",
                },
            ],
        )
        if needs_asset_discovery
        else call("inspect_ui_project", {}, "inspect-current-composition")
    )
    return [
        call(
            "read_file",
            {"file_path": "/skills/app-ui-model/SKILL.md"},
            "load-composition-skill",
        ),
        composition_reads,
        call("mutate_app_ui_model", {"operations": operations}, "atomic-mutation"),
        call("validate_creator_changes", {}, "static-validation"),
        call("inspect_runtime_errors", {}, "runtime-verification"),
        AIMessage(content="Composition updated and verified."),
    ]


@pytest.mark.parametrize(
    ("request", "operations", "assert_final"),
    [
        (
            "帮我去掉左边的历史会话",
            [
                {
                    "type": "remove_plugin",
                    "instanceId": "conversation-thread-list-main",
                },
                {"type": "remove_layout_node", "nodeRef": "l1"},
            ],
            lambda model: len(model["root"]["children"]) == 1
            and any(
                item[0]["id"] == "conversation-service-main"
                for item in walk_plugins(model)
            ),
        ),
        (
            "先把历史会话隐藏掉",
            [
                {
                    "type": "set_plugin_enabled",
                    "instanceId": "conversation-thread-list-main",
                    "enabled": False,
                }
            ],
            lambda model: model["root"]["children"][0]["child"]["plugins"][0][
                "enabled"
            ]
            is False
            and len(model["root"]["children"]) == 2,
        ),
        (
            "把推荐问题删掉",
            [
                {
                    "type": "remove_plugin",
                    "instanceId": "conversation-suggestions-main",
                }
            ],
            lambda model: model["root"]["children"][1]["child"]["plugins"][0][
                "slots"
            ]["emptySuggestions"]
            == [],
        ),
        (
            "增加主题切换",
            [
                {
                    "type": "insert_plugin",
                    "plugin": plugin("theme-switch-main", "theme-switch"),
                    "target": {"type": "layout_slot", "slotRef": "l4"},
                }
            ],
            lambda model: any(
                item[0]["id"] == "theme-switch-main" for item in walk_plugins(model)
            ),
        ),
    ],
    ids=["remove-region", "hide-region", "remove-child", "reuse-capability"],
)
def test_canonical_composition_e2e_pack(tmp_path, request, operations, assert_final):
    client = CompositionClient(tmp_path, initial_model())
    diagnostics = RuntimeDiagnosticStore()
    validation = PassingValidation(client, diagnostics)
    model = GroundingScriptModel(responses=scripted_responses(operations))
    agent = create_domain_write_creator_agent(
        model=model,
        workspace=tmp_path,
        project_control=client,
        skills_root=SKILLS_ROOT,
        diagnostics=diagnostics,
        thread_id="composition-golden",
        validation_runner=validation,
        automatic_completion_repair=True,
    )
    agent.activity.begin("composition-golden")

    result = asyncio.run(agent.run(request))
    receipt = agent.activity.finish()

    assert assert_final(client.model())
    assert result.text == "Composition updated and verified."
    assert result.metrics.modelCalls <= 6
    assert result.change_layer_metrics["projectControlReads"] <= 2
    assert result.change_layer_metrics["appUIModelMutationAttempts"] == 1
    assert result.change_layer_metrics["sourceWrites"] == 0
    assert result.change_layer_metrics["crossLayerTransitionCount"] == 0
    assert result.change_layer_metrics["skillsLoaded"] == ["app-ui-model"]
    assert result.app_ui_model_mutations.requests == 1
    assert result.app_ui_model_mutations.successfulRequests == 1
    assert receipt["verification"]["status"] == "changed-and-verified"
    assert not any(
        path.startswith("plugins/") and path != REGISTRY_PATH
        for path in result.change_layer_metrics["finalChangedPaths"]
    )


def test_remove_capability_is_not_documented_as_composition_only():
    skill = (SKILLS_ROOT / "app-ui-model/SKILL.md").read_text(encoding="utf-8")
    assert "Completely remove history capability" in skill
    assert "Runtime Capability" in skill
    assert "Incorrect: interpret request A" in skill
