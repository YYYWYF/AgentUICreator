from __future__ import annotations

import asyncio
import copy
import json
from datetime import datetime, timezone
from pathlib import Path

from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage

from agent_ui_creator.domain_agent import create_domain_write_creator_agent
from agent_ui_creator.files import read_creator_file_state
from agent_ui_creator.project_control import ProjectControlMetrics
from agent_ui_creator.runtime_diagnostics import (
    RuntimeDiagnosticEnvelope,
    RuntimeDiagnosticStore,
)
from agent_ui_creator.validation import CommandExecutionResult


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
SKILLS_ROOT = REPOSITORY_ROOT / "packages" / "creator" / "skills"
APP_UI_MODEL_PATH = "app-ui/app-ui.json"
REGISTRY_PATH = "plugins/registry.generated.ts"
TASK_PLUGIN_FILES = {
    "/plugins/task-status/manifest.json": (
        '{"id":"task-status","name":"Task Status","version":"1.0.0",'
        '"description":"Shows current task status","data":{"messages":false,'
        '"state":true}}\n'
    ),
    "/plugins/task-status/definition.ts": (
        'import { defineUIPlugin } from "../../framework/contracts/ui-plugin";\n'
        'import manifest from "./manifest.json";\n'
        'import { TaskStatus } from "./index";\n'
        'export default defineUIPlugin({ manifest, component: TaskStatus });\n'
    ),
    "/plugins/task-status/index.tsx": (
        'export function TaskStatus() { return <section>Ready</section>; }\n'
    ),
    "/plugins/task-status/styles.css": ".status { padding: 8px; }\n",
}


def call(name, arguments, call_id):
    return AIMessage(
        content="",
        tool_calls=[{"name": name, "args": arguments, "id": call_id}],
    )


def batch(*messages):
    return AIMessage(
        content="", tool_calls=[message.tool_calls[0] for message in messages]
    )


class ScriptModel(FakeMessagesListChatModel):
    def bind_tools(self, tools, **kwargs):
        object.__setattr__(self, "bound_tool_names", [tool.name for tool in tools])
        return self


def make_project(tmp_path: Path) -> Path:
    (tmp_path / "app-ui").mkdir()
    (tmp_path / "plugins/example").mkdir(parents=True)
    (tmp_path / APP_UI_MODEL_PATH).write_text(
        json.dumps(
            {
                "version": "2",
                "pluginInstances": {},
                "layout": {"type": "Slot", "id": "root", "slotId": "right.status"},
            }
        )
        + "\n",
        encoding="utf-8",
    )
    (tmp_path / REGISTRY_PATH).write_text(
        "export const pluginDefinitions = [];\n", encoding="utf-8"
    )
    (tmp_path / "plugins/example/manifest.json").write_text(
        '{"id":"example"}\n', encoding="utf-8"
    )
    (tmp_path / "plugins/example/index.tsx").write_text(
        "export function Example() { return <section />; }\n", encoding="utf-8"
    )
    return tmp_path


class PluginProjectControl:
    def __init__(
        self,
        root: Path,
        diagnostics: RuntimeDiagnosticStore,
        *,
        runtime_error: bool = False,
    ) -> None:
        self.root = root
        self.diagnostics = diagnostics
        self.runtime_error = runtime_error
        self.service_topology = {
            "services": [
                {
                    "name": "agent-ui.theme",
                    "status": "available",
                    "providers": [{"pluginId": "theme-provider", "selected": True}],
                    "requiredConsumers": [],
                    "optionalConsumers": [],
                }
            ],
            "plugins": [],
            "issues": [],
        }
        self.metrics = ProjectControlMetrics()

    def hash(self) -> str:
        return read_creator_file_state(self.root, APP_UI_MODEL_PATH).hash

    def model(self):
        return json.loads((self.root / APP_UI_MODEL_PATH).read_text(encoding="utf-8"))

    def record(self, name: str) -> None:
        self.metrics.record(name, 1, False)

    async def list_ui_plugins(self):
        self.record("list_ui_plugins")
        return {
            "appUIModelHash": self.hash(),
            "pluginAssets": [{"pluginId": "example", "registered": False}],
            "registry": {"registeredPluginIds": []},
        }

    async def inspect_ui_plugin(self, plugin_id):
        self.record("inspect_ui_plugin")
        return {"pluginId": plugin_id, "instances": []}

    async def inspect_ui_services(self):
        self.record("inspect_ui_services")
        return {"appUIModelHash": self.hash(), **self.service_topology}

    async def inspect_ui_slots(self, *, root=None):
        self.record("inspect_ui_slots")
        return {
            "appUIModelHash": self.hash(),
            "slots": [{"slotId": "right.status", "occupants": []}],
        }

    async def inspect_app_ui_model(self):
        self.record("inspect_app_ui_model")
        return {"hash": self.hash(), "model": self.model()}

    async def inspect_ui_project(self):
        self.record("inspect_ui_project")
        return {
            "appUIModel": {"hash": self.hash(), "model": self.model()},
            "pluginInstances": list(self.model()["pluginInstances"].values()),
        }

    async def inspect_ui_plugin_source_references(self, plugin_id):
        self.record("inspect_ui_plugin_source_references")
        return {
            "pluginId": plugin_id,
            "files": sorted(
                path.lstrip("/")
                for path in (
                    TASK_PLUGIN_FILES
                    if plugin_id == "task-status"
                    else {"/plugins/example/index.tsx": ""}
                )
            ),
        }

    async def request_app_ui_model_mutation(self, input):
        self.record("mutate_app_ui_model")
        before_hash = self.hash()
        model = self.model()
        operation = input["operations"][0]
        instance = copy.deepcopy(operation["instance"])
        if model["pluginInstances"].get(instance["id"]) == instance:
            return {
                "schemaVersion": 1,
                "transactionId": "plugin-golden-noop",
                "changed": False,
                "changedPaths": [],
                "appUIModel": {
                    "beforeHash": before_hash,
                    "afterHash": before_hash,
                },
                "snapshotToken": {
                    "appUIModelHash": before_hash,
                    "registryHash": read_creator_file_state(
                        self.root, REGISTRY_PATH
                    ).hash,
                },
            }
        model["pluginInstances"][instance["id"]] = instance
        (self.root / APP_UI_MODEL_PATH).write_text(
            json.dumps(model, indent=2) + "\n", encoding="utf-8"
        )
        (self.root / REGISTRY_PATH).write_text(
            'import taskStatus from "./task-status/definition";\n'
            "export const pluginDefinitions = [taskStatus];\n",
            encoding="utf-8",
        )
        after_hash = self.hash()
        return {
            "schemaVersion": 1,
            "transactionId": "plugin-golden",
            "changed": True,
            "changedPaths": [APP_UI_MODEL_PATH, REGISTRY_PATH],
            "appUIModel": {"beforeHash": before_hash, "afterHash": after_hash},
            "snapshotToken": {
                "appUIModelHash": after_hash,
                "registryHash": read_creator_file_state(
                    self.root, REGISTRY_PATH
                ).hash,
            },
        }


def runtime_diagnostic(app_hash: str, status: str):
    return RuntimeDiagnosticEnvelope.model_validate(
        {
            "threadId": "golden-thread",
            "diagnostic": {
                "schemaVersion": 1,
                "kind": "plugin-render",
                "status": status,
                "appUIModelHash": app_hash,
                "occurredAt": datetime.now(timezone.utc).isoformat(),
                "pluginId": "task-status",
                "instanceId": "task-status-main",
                **(
                    {"errorMessage": "TaskStatus render failed"}
                    if status == "error"
                    else {}
                ),
            },
        }
    )


class ValidationScript:
    def __init__(self, results=None, after=None):
        self.results = list(results or [])
        self.after = after
        self.calls = []

    async def execute_known_command(self, command):
        self.calls.append(command)
        result = (
            self.results.pop(0)
            if self.results
            else CommandExecutionResult("", 0, False)
        )
        if self.after is not None:
            self.after(len(self.calls), command, result)
        return result


def create_files_message(content_by_path=TASK_PLUGIN_FILES):
    return call(
        "create_ui_plugin",
        {
            "pluginId": "task-status",
            "files": [
                {
                    "relativePath": path.removeprefix(
                        "/plugins/task-status/"
                    ),
                    "content": content,
                }
                for path, content in content_by_path.items()
            ]
        },
        "create-source",
    )


def mutation_message():
    return call(
        "mutate_app_ui_model",
        {
            "operations": [
                {
                    "type": "add_instance",
                    "instance": {
                        "id": "task-status-main",
                        "pluginId": "task-status",
                        "enabled": True,
                        "mount": {"slotId": "right.status"},
                    },
                }
            ]
        },
        "compose",
    )


def discovery_messages():
    return [
        call("list_ui_plugins", {}, "list"),
        batch(
            call("inspect_ui_plugin", {"pluginId": "example"}, "inspect-example"),
            call(
                "read_file",
                {"file_path": "/plugins/example/index.tsx"},
                "read-example",
            ),
        ),
    ]


def composition_inspection_message():
    return batch(
        call("inspect_app_ui_model", {}, "inspect-model"),
        call("inspect_ui_slots", {"root": "right.status"}, "inspect-slot"),
    )


def make_agent(
    tmp_path,
    responses,
    *,
    runtime_error=False,
    runner=None,
    already_satisfied=False,
):
    root = make_project(tmp_path)
    if already_satisfied:
        plugin_root = root / "plugins/task-status"
        plugin_root.mkdir()
        for virtual_path, content in TASK_PLUGIN_FILES.items():
            (root / virtual_path.lstrip("/")).write_text(content, encoding="utf-8")
        model = json.loads((root / APP_UI_MODEL_PATH).read_text(encoding="utf-8"))
        model["pluginInstances"]["task-status-main"] = {
            "id": "task-status-main",
            "pluginId": "task-status",
            "enabled": True,
            "mount": {"slotId": "right.status"},
        }
        (root / APP_UI_MODEL_PATH).write_text(
            json.dumps(model, indent=2) + "\n", encoding="utf-8"
        )
        (root / REGISTRY_PATH).write_text(
            'import taskStatus from "./task-status/definition";\n'
            "export const pluginDefinitions = [taskStatus];\n",
            encoding="utf-8",
        )
    diagnostics = RuntimeDiagnosticStore()
    client = PluginProjectControl(
        root, diagnostics, runtime_error=runtime_error
    )
    model = ScriptModel(responses=responses)
    validation = runner or ValidationScript()
    original_after = validation.after

    def publish_runtime_after_validation(call_count, command, result):
        if (
            command == "pnpm typecheck"
            and result.exit_code == 0
            and "task-status-main" in client.model()["pluginInstances"]
        ):
            current_hash = client.hash()
            diagnostics.record(
                RuntimeDiagnosticEnvelope.model_validate(
                    {
                        "threadId": "golden-thread",
                        "composition": {
                            "schemaVersion": 1,
                            "appUIModelHash": current_hash,
                            "observedAt": datetime.now(timezone.utc).isoformat(),
                            "instances": [
                                {
                                    "instanceId": "task-status-main",
                                    "pluginId": "task-status",
                                    "slotId": "right.status",
                                }
                            ],
                        },
                    }
                )
            )
            if client.runtime_error:
                diagnostics.record(runtime_diagnostic(current_hash, "error"))
        if original_after is not None:
            original_after(call_count, command, result)

    validation.after = publish_runtime_after_validation
    agent = create_domain_write_creator_agent(
        model=model,
        workspace=root,
        project_control=client,
        skills_root=SKILLS_ROOT,
        diagnostics=diagnostics,
        thread_id="golden-thread",
        validation_runner=validation,
        automatic_completion_repair=True,
    )
    agent.activity.begin("plugin-development-golden")
    return agent, client, diagnostics, validation


def test_full_plugin_creation_golden_scenario(tmp_path):
    responses = [
        *discovery_messages(),
        create_files_message(),
        call("validate_creator_changes", {}, "validate-source"),
        composition_inspection_message(),
        mutation_message(),
        call("validate_creator_changes", {}, "validate-final"),
        call("inspect_runtime_errors", {}, "runtime-final"),
        AIMessage(content="Task Status Plugin created and verified."),
    ]
    agent, client, _diagnostics, _validation = make_agent(tmp_path, responses)

    result = asyncio.run(agent.run("Create Task Status and mount it in right.status."))
    receipt = agent.activity.finish()

    assert (tmp_path / "plugins/task-status/manifest.json").is_file()
    assert "provides" not in (
        tmp_path / "plugins/task-status/definition.ts"
    ).read_text(encoding="utf-8")
    assert client.model()["pluginInstances"]["task-status-main"]["enabled"] is True
    assert "taskStatus" in (tmp_path / REGISTRY_PATH).read_text(encoding="utf-8")
    assert agent.validation.current_result().status == "passed"
    assert agent.runtime_inspection.current_result()["runtimeStatus"] == "passed"
    assert receipt["verification"]["status"] == "changed-and-verified"
    assert receipt["transaction"]["undoable"] is True
    assert agent.activity.transactions.load(
        "plugin-development-golden"
    ).validation_revision == agent.activity.revision
    assert result.text == "Task Status Plugin created and verified."


def test_already_satisfied_semantic_noop_golden_scenario(tmp_path):
    responses = [
        composition_inspection_message(),
        mutation_message(),
        AIMessage(content="Task Status is already mounted in right.status."),
    ]
    agent, _client, _diagnostics, validation = make_agent(
        tmp_path,
        responses,
        already_satisfied=True,
    )

    result = asyncio.run(
        agent.run("Mount Task Status in right.status if it is not already there.")
    )
    receipt = agent.activity.finish()

    assert result.text == "Task Status is already mounted in right.status."
    assert result.metrics.modelCalls == 3
    assert validation.calls == []
    assert receipt["files"] == []
    assert receipt["semanticNoop"]["reason"] == "already-satisfied"
    assert receipt["verification"]["status"] == "already-satisfied"


def test_existing_plugin_multi_file_change_uses_one_atomic_mutation(tmp_path):
    responses = [
        batch(
            call(
                "inspect_ui_plugin",
                {"pluginId": "task-status"},
                "inspect-task-status",
            ),
            call(
                "inspect_ui_plugin_source_references",
                {"pluginId": "task-status"},
                "inspect-task-status-source",
            ),
        ),
        batch(
            call(
                "read_file",
                {"file_path": "/plugins/task-status/index.tsx"},
                "read-index",
            ),
            call(
                "read_file",
                {"file_path": "/plugins/task-status/styles.css"},
                "read-styles",
            ),
        ),
        call(
            "mutate_ui_plugin_source",
            {
                "pluginId": "task-status",
                "changes": [
                    {
                        "type": "edit",
                        "relativePath": "index.tsx",
                        "edits": [
                            {
                                "oldText": "<section>Ready</section>",
                                "newText": "<section>Current Task</section>",
                            }
                        ],
                    },
                    {
                        "type": "edit",
                        "relativePath": "styles.css",
                        "edits": [
                            {"oldText": "padding: 8px", "newText": "padding: 12px"}
                        ],
                    },
                ],
            },
            "mutate-source",
        ),
        call("validate_creator_changes", {}, "validate-source"),
        call("inspect_runtime_errors", {}, "runtime-source"),
        AIMessage(content="Task Status source updated and verified."),
    ]
    agent, _client, _diagnostics, _validation = make_agent(
        tmp_path, responses, already_satisfied=True
    )

    result = asyncio.run(
        agent.run(
            "把 Task Status 的标题改成 Current Task，同时把卡片 padding 从 8px 调成 12px。"
        )
    )

    names = [item.name for item in agent.runtime.activities]
    assert names.count("mutate_ui_plugin_source") == 1
    assert "edit_file" not in names
    assert "Current Task" in (
        tmp_path / "plugins/task-status/index.tsx"
    ).read_text()
    assert "padding: 12px" in (
        tmp_path / "plugins/task-status/styles.css"
    ).read_text()
    assert result.text == "Task Status source updated and verified."


def test_existing_optional_service_is_reused_without_ownership_question(tmp_path):
    responses = [
        call("inspect_ui_services", {}, "inspect-services"),
        batch(
            call(
                "inspect_ui_plugin",
                {"pluginId": "task-status"},
                "inspect-task-status",
            ),
            call(
                "inspect_ui_plugin_source_references",
                {"pluginId": "task-status"},
                "inspect-task-status-source",
            ),
        ),
        batch(
            call(
                "read_file",
                {"file_path": "/plugins/task-status/definition.ts"},
                "read-definition",
            ),
            call(
                "read_file",
                {"file_path": "/plugins/task-status/index.tsx"},
                "read-index",
            ),
        ),
        call(
            "mutate_ui_plugin_source",
            {
                "pluginId": "task-status",
                "changes": [
                    {
                        "type": "edit",
                        "relativePath": "definition.ts",
                        "edits": [
                            {
                                "oldText": 'import manifest from "./manifest.json";\n',
                                "newText": (
                                    'import manifest from "./manifest.json";\n'
                                    'import { AGENT_UI_THEME_SERVICE } from "../../services/agent-ui-theme";\n'
                                ),
                            },
                            {
                                "oldText": "export default defineUIPlugin({ manifest, component: TaskStatus });",
                                "newText": (
                                    "export default defineUIPlugin({ manifest, "
                                    "optionalInject: [AGENT_UI_THEME_SERVICE], component: TaskStatus });"
                                ),
                            },
                        ],
                    },
                    {
                        "type": "edit",
                        "relativePath": "index.tsx",
                        "edits": [
                            {
                                "oldText": "export function TaskStatus() { return <section>Ready</section>; }",
                                "newText": (
                                    'import { usePluginService } from "../../runtime/plugins";\n'
                                    'import { AGENT_UI_THEME_SERVICE, type AgentUIThemeService } from "../../services/agent-ui-theme";\n'
                                    "export function TaskStatus() { const theme = usePluginService<AgentUIThemeService>(AGENT_UI_THEME_SERVICE); "
                                    'return <section data-theme={theme?.getMode() ?? "default"}>Ready</section>; }'
                                ),
                            }
                        ],
                    },
                ],
            },
            "mutate-theme-support",
        ),
        call("validate_creator_changes", {}, "validate-theme-support"),
        call("inspect_runtime_errors", {}, "runtime-theme-support"),
        AIMessage(content="Task Status now optionally follows the existing Theme Service."),
    ]
    agent, _client, _diagnostics, _validation = make_agent(
        tmp_path, responses, already_satisfied=True
    )

    result = asyncio.run(agent.run("让 Task Status 跟随系统主题。"))

    names = [item.name for item in agent.runtime.activities]
    assert names[0] == "inspect_ui_services"
    assert names.count("mutate_ui_plugin_source") == 1
    assert "optionalInject: [AGENT_UI_THEME_SERVICE]" in (
        tmp_path / "plugins/task-status/definition.ts"
    ).read_text(encoding="utf-8")
    assert result.text == "Task Status now optionally follows the existing Theme Service."


def test_missing_shared_service_stops_for_ownership_clarification(tmp_path):
    responses = [
        call("inspect_ui_services", {}, "inspect-services"),
        AIMessage(
            content=(
                "当前 Search Plugin 需要会话跳转能力，但项目没有对应 Service。"
                "建议由 conversation-history 提供 ConversationNavigationService，"
                "Search Plugin 通过 inject 使用。是否按这个方式继续？"
            )
        ),
    ]
    agent, client, _diagnostics, validation = make_agent(tmp_path, responses)
    client.service_topology = {"services": [], "plugins": [], "issues": []}

    result = asyncio.run(agent.run("让 Search Plugin 点击结果后切换历史会话。"))

    assert [item.name for item in agent.runtime.activities] == ["inspect_ui_services"]
    assert validation.calls == []
    assert not (tmp_path / "plugins/task-status").exists()
    assert result.text.endswith("是否按这个方式继续？")


def test_explicit_service_ownership_does_not_repeat_confirmation(tmp_path):
    responses = [
        call("inspect_ui_services", {}, "inspect-services"),
        AIMessage(
            content=(
                "Ownership 已明确；当前阶段尚未开放 Service contract 创建工具，"
                "因此没有使用通用文件写入绕过门禁。"
            )
        ),
    ]
    agent, client, _diagnostics, validation = make_agent(tmp_path, responses)
    client.service_topology = {"services": [], "plugins": [], "issues": []}

    result = asyncio.run(
        agent.run(
            "让 conversation-history 提供 ConversationNavigationService，再让 Search Plugin 使用。"
        )
    )

    assert [item.name for item in agent.runtime.activities] == ["inspect_ui_services"]
    assert validation.calls == []
    assert "是否" not in result.text
    assert "尚未开放" in result.text


def test_existing_plugin_single_file_change_still_uses_edit_file(tmp_path):
    responses = [
        call(
            "read_file",
            {"file_path": "/plugins/task-status/index.tsx"},
            "read-index",
        ),
        call(
            "edit_file",
            {
                "file_path": "/plugins/task-status/index.tsx",
                "old_string": "Ready",
                "new_string": "Running",
            },
            "edit-index",
        ),
        call("validate_creator_changes", {}, "validate-source"),
        call("inspect_runtime_errors", {}, "runtime-source"),
        AIMessage(content="Task Status copy updated and verified."),
    ]
    agent, _client, _diagnostics, _validation = make_agent(
        tmp_path, responses, already_satisfied=True
    )

    result = asyncio.run(agent.run("把 Ready 改成 Running。"))

    names = [item.name for item in agent.runtime.activities]
    assert names.count("edit_file") == 1
    assert "mutate_ui_plugin_source" not in names
    assert "Running" in (
        tmp_path / "plugins/task-status/index.tsx"
    ).read_text()
    assert result.text == "Task Status copy updated and verified."


def test_failed_validation_repairs_before_completion(tmp_path):
    invalid_files = {
        **TASK_PLUGIN_FILES,
        "/plugins/task-status/index.tsx": (
            "export function TaskStatus() { const status: string = 1; "
            "return <section>{status}</section>; }\n"
        ),
    }
    runner = ValidationScript(
        results=[
            CommandExecutionResult("", 0, False),
            CommandExecutionResult("index.tsx: Type 'number' is not assignable", 2, False),
            CommandExecutionResult("", 0, False),
            CommandExecutionResult("", 0, False),
            CommandExecutionResult("", 0, False),
            CommandExecutionResult("", 0, False),
        ]
    )
    responses = [
        *discovery_messages(),
        create_files_message(invalid_files),
        call("validate_creator_changes", {}, "validate-failed"),
        AIMessage(content="Task Status is complete."),
        call(
            "read_file",
            {"file_path": "/plugins/task-status/index.tsx"},
            "read-broken",
        ),
        call(
            "edit_file",
            {
                "file_path": "/plugins/task-status/index.tsx",
                "old_string": "const status: string = 1",
                "new_string": 'const status = "ready"',
            },
            "repair-static",
        ),
        call("validate_creator_changes", {}, "validate-repaired-source"),
        composition_inspection_message(),
        mutation_message(),
        call("validate_creator_changes", {}, "validate-repaired-final"),
        call("inspect_runtime_errors", {}, "runtime-repaired"),
        AIMessage(content="Task Status repaired and verified."),
    ]
    agent, _client, _diagnostics, _validation = make_agent(
        tmp_path, responses, runner=runner
    )

    result = asyncio.run(agent.run("Create and verify Task Status."))

    assert [item.name for item in agent.runtime.activities].count(
        "validate_creator_changes"
    ) == 3
    assert any(item.name == "edit_file" for item in agent.runtime.activities)
    assert agent.validation.current_result().status == "passed"
    assert agent.activity.snapshot()["verification"]["status"] == (
        "changed-and-verified"
    )
    assert result.text == "Task Status repaired and verified."


def test_runtime_error_repairs_before_completion(tmp_path):
    diagnostics = None
    client = None

    def resolve_after_final_validation(call_count, _command, _result):
        if call_count == 6:
            diagnostics.record(runtime_diagnostic(client.hash(), "resolved"))

    runner = ValidationScript(after=resolve_after_final_validation)
    responses = [
        *discovery_messages(),
        create_files_message(),
        call("validate_creator_changes", {}, "validate-source"),
        composition_inspection_message(),
        mutation_message(),
        call("validate_creator_changes", {}, "validate-composed"),
        call("inspect_runtime_errors", {}, "runtime-failed"),
        AIMessage(content="Runtime verified."),
        call(
            "read_file",
            {"file_path": "/plugins/task-status/index.tsx"},
            "read-runtime-source",
        ),
        call(
            "edit_file",
            {
                "file_path": "/plugins/task-status/index.tsx",
                "old_string": "<section>Ready</section>",
                "new_string": '<section data-safe="true">Ready</section>',
            },
            "repair-runtime",
        ),
        call("validate_creator_changes", {}, "validate-runtime-repair"),
        call("inspect_runtime_errors", {}, "runtime-passed"),
        AIMessage(content="Runtime error repaired and verified."),
    ]
    agent, client, diagnostics, _validation = make_agent(
        tmp_path,
        responses,
        runtime_error=True,
        runner=runner,
    )

    result = asyncio.run(agent.run("Create Task Status and repair Runtime failures."))
    runtime_results = [
        json.loads(item.result)["result"]["runtimeStatus"]
        for item in agent.runtime.activities
        if item.name == "inspect_runtime_errors"
    ]

    assert runtime_results == ["failed", "passed"]
    assert result.text == "Runtime error repaired and verified."
    assert agent.activity.snapshot()["verification"]["status"] == (
        "changed-and-verified"
    )
