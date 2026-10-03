from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest
from langchain.agents.middleware import ModelResponse
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage, SystemMessage

from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.app_ui_model import ProjectMutationCoordinator
from agent_ui_creator.domain_agent import (
    ALLOWED_DOMAIN_WRITE_TOOLS,
    create_domain_write_creator_agent,
)
from agent_ui_creator.domain_agent.tool_batch_policy import (
    is_valid_domain_tool_batch,
)
from agent_ui_creator.minimal_agent.path_policy import MinimalAgentPathPolicy
from agent_ui_creator.source_tools import (
    SourceCreationError,
    UIPluginCreationService,
    UIPluginSourceFile,
    UISourceCreationService,
    UISourceFile,
)


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
SKILLS_ROOT = REPOSITORY_ROOT / "packages" / "creator" / "skills"


def source(path: str, content: str = "export {};\n") -> UISourceFile:
    return UISourceFile(path=path, content=content)


def plugin_source(
    relative_path: str, content: str = "export {};\n"
) -> UIPluginSourceFile:
    return UIPluginSourceFile(relativePath=relative_path, content=content)


def plugin_sources(plugin_id: str = "task-status") -> list[UIPluginSourceFile]:
    return [
        plugin_source("manifest.json", f'{{"id":"{plugin_id}"}}\n'),
        plugin_source("definition.ts"),
        plugin_source("index.tsx"),
    ]


def service(tmp_path: Path, run_id: str = "source-create"):
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin(run_id)
    return (
        UISourceCreationService(
            project_root=tmp_path,
            activity=activity,
            mutation_coordinator=ProjectMutationCoordinator(),
            path_policy=MinimalAgentPathPolicy.internal_source(),
        ),
        activity,
    )


def plugin_service(tmp_path: Path, run_id: str = "source-create"):
    source_creation, activity = service(tmp_path, run_id)
    return (
        UIPluginCreationService(
            project_root=tmp_path,
            source_creation=source_creation,
            activity=activity,
            internal_trusted=True,
        ),
        activity,
    )


def test_internal_source_primitive_creates_multiple_files_atomically(tmp_path):
    creation, activity = service(tmp_path)

    result = asyncio.run(
        creation.create(
            [
                source("/plugins/task-status/manifest.json", "{}\n"),
                source("/plugins/task-status/definition.ts"),
                source("/plugins/task-status/index.tsx"),
            ]
        )
    )

    assert result.to_dict() == {
        "createdPaths": [
            "plugins/task-status/manifest.json",
            "plugins/task-status/definition.ts",
            "plugins/task-status/index.tsx",
        ],
        "mutationRevision": 3,
    }
    assert activity.revision == 3
    assert (tmp_path / "plugins/task-status/index.tsx").is_file()


def test_v2_source_creation_uses_source_root(tmp_path):
    metadata = tmp_path / ".agent-ui"
    metadata.mkdir()
    (metadata / "project.json").write_text(
        json.dumps({"version": "2", "mode": "assistant", "sourceRoot": "src/agent-ui"}),
        encoding="utf-8",
    )
    root_plugin = tmp_path / "plugins/foo/index.ts"
    root_plugin.parent.mkdir(parents=True)
    root_plugin.write_text("host file\n", encoding="utf-8")
    creation, _activity = service(tmp_path)
    result = asyncio.run(creation.create([source("/plugins/foo/index.ts")]))
    assert result.created_paths == ("src/agent-ui/plugins/foo/index.ts",)
    assert (tmp_path / "src/agent-ui/plugins/foo/index.ts").is_file()
    assert root_plugin.read_text(encoding="utf-8") == "host file\n"


def test_v2_plugin_creation_uses_source_root(tmp_path):
    metadata = tmp_path / ".agent-ui"
    metadata.mkdir()
    (metadata / "project.json").write_text(
        json.dumps({"version": "2", "mode": "assistant", "sourceRoot": "src/agent-ui"}),
        encoding="utf-8",
    )

    plugin_creation, _activity = plugin_service(tmp_path, "v2-plugin-create")
    result = asyncio.run(plugin_creation.create("task-status", plugin_sources()))
    assert "src/agent-ui/plugins/task-status/index.tsx" in result.created_paths
    assert (tmp_path / "src/agent-ui/plugins/task-status/index.tsx").is_file()
    assert not (tmp_path / "plugins/task-status").exists()


def test_create_ui_plugin_enforces_plugin_domain_and_creates_atomically(tmp_path):
    creation, activity = plugin_service(tmp_path)

    result = asyncio.run(creation.create("task-status", plugin_sources()))

    assert result.to_dict() == {
        "pluginId": "task-status",
        "created": True,
        "createdPaths": [
            "plugins/task-status/manifest.json",
            "plugins/task-status/definition.ts",
            "plugins/task-status/index.tsx",
        ],
        "mutationRevision": 3,
    }
    assert activity.revision == 3
    assert (tmp_path / "plugins/task-status/manifest.json").is_file()


def test_create_ui_plugin_requires_its_stylesheet_to_be_loaded(tmp_path):
    creation, activity = plugin_service(tmp_path)
    files = [*plugin_sources(), plugin_source("styles.css", ".task-status { color: red; }\n")]

    with pytest.raises(SourceCreationError) as captured:
        asyncio.run(creation.create("task-status", files))

    assert captured.value.code == "PLUGIN_STYLESHEET_NOT_IMPORTED"
    assert activity.revision == 0
    assert not (tmp_path / "plugins/task-status").exists()

    files[2] = plugin_source("index.tsx", 'import "./styles.css";\nexport {};\n')
    result = asyncio.run(creation.create("task-status", files))
    assert result.plugin_id == "task-status"


def test_create_ui_plugin_rejects_side_panel_local_collapse_before_write(tmp_path):
    creation, activity = plugin_service(tmp_path)
    files = plugin_sources()
    files[0] = plugin_source("manifest.json", json.dumps({
        "id": "task-status", "authoring": {"defaultPlacement": {
            "type": "relative", "relation": "after", "anchorPluginId": "conversation-surface",
        }},
    }))
    files[2] = plugin_source("index.tsx", (
        "import { useState } from 'react';\n"
        "export function Panel() { const [collapsed, setCollapsed] = useState(false); "
        "return <button onClick={() => setCollapsed(true)}>Hide</button>; }\n"
    ))

    with pytest.raises(SourceCreationError) as captured:
        asyncio.run(creation.create("task-status", files))
    assert captured.value.code == "PLUGIN_PANEL_COLLAPSE_MUST_USE_LAYOUT"
    assert "As the next tool call, retry create_ui_plugin" in str(captured.value)
    assert "do not spend model turns editing locale files now" in str(captured.value)
    assert activity.revision == 0
    assert not (tmp_path / "plugins/task-status").exists()

    files[2] = plugin_source("index.tsx", (
        "import { useState } from 'react';\n"
        "export function Panel() { const [done, setDone] = useState(false); "
        "return <button onClick={() => setDone(true)}>Done</button>; }\n"
    ))
    assert asyncio.run(creation.create("task-status", files)).plugin_id == "task-status"


def test_create_ui_plugin_normalizes_known_project_root_imports_atomically(tmp_path):
    for directory in ("framework/contracts", "services", "agent-ui/i18n"):
        (tmp_path / directory).mkdir(parents=True)
    creation, _activity = plugin_service(tmp_path)
    files = plugin_sources()
    files[1] = plugin_source("definition.ts", (
        'import type { UIPluginDefinition } from "../framework/contracts/ui-plugin";\n'
        'import { AGENT_UI_LOCALE_SERVICE } from "../services/agent-ui-locale";\n'
        'export default { optionalInject: [AGENT_UI_LOCALE_SERVICE] } as UIPluginDefinition;\n'
    ))
    files[2] = plugin_source("index.tsx", (
        'import { useAgentUILocale } from "../agent-ui/i18n/useAgentUILocale";\n'
        'export function App() { return useAgentUILocale("layout").open; }\n'
    ))

    result = asyncio.run(creation.create("task-status", files))

    assert len(result.to_dict()["normalizedImports"]) == 3
    assert 'from "../../framework/contracts/ui-plugin"' in (
        tmp_path / "plugins/task-status/definition.ts"
    ).read_text()
    assert 'from "../../services/agent-ui-locale"' in (
        tmp_path / "plugins/task-status/definition.ts"
    ).read_text()
    assert 'from "../../agent-ui/i18n/useAgentUILocale"' in (
        tmp_path / "plugins/task-status/index.tsx"
    ).read_text()


def test_create_ui_plugin_uses_direct_builtin_service_module_in_definition(tmp_path):
    service_file = tmp_path / "services/agent-ui-locale.ts"
    service_file.parent.mkdir(parents=True)
    service_file.write_text('export const AGENT_UI_LOCALE_SERVICE = "agent-ui.locale";')
    creation, _activity = plugin_service(tmp_path)
    files = plugin_sources()
    files[1] = plugin_source("definition.ts", (
        'import { AGENT_UI_LOCALE_SERVICE } from "../../services";\n'
        'export default { optionalInject: [AGENT_UI_LOCALE_SERVICE] };\n'
    ))

    result = asyncio.run(creation.create("task-status", files))

    definition = (tmp_path / "plugins/task-status/definition.ts").read_text()
    assert 'from "../../services/agent-ui-locale"' in definition
    assert result.to_dict()["normalizedImports"] == [{
        "relativePath": "definition.ts",
        "from": "../../services",
        "to": "../../services/agent-ui-locale",
    }]


@pytest.mark.parametrize("diagnostic_code, expects_retry_hint", [
    ("NO_MATCHING_SLOT", False),
    ("RESPONSIVE_DRAWER_PLACEMENT_INVALID", True),
])
def test_create_ui_plugin_preflights_declared_placement_before_source_commit(
    tmp_path, diagnostic_code, expects_retry_hint
):
    source_creation, activity = service(tmp_path)

    class Authority:
        def require_create(self, plugin_id):
            assert plugin_id == "task-status"

        def mark_created(self, plugin_id):
            assert plugin_id == "task-status"

    class ProjectControl:
        eligible = False
        calls = []

        async def inspect_ui_project(self):
            return {"appUIModel": {"hash": "model"}, "capabilityCatalog": {"revision": "catalog"}}

        async def preflight_ui_plugin_placement(self, **kwargs):
            self.calls.append(kwargs)
            return {"eligible": self.eligible, "diagnostic": {"code": diagnostic_code}}

    control = ProjectControl()
    creation = UIPluginCreationService(
        project_root=tmp_path,
        source_creation=source_creation,
        activity=activity,
        development_authority=Authority(),
        project_control=control,
    )
    files = plugin_sources()
    manifest = {"id": "task-status", "authoring": {"defaultPlacement": {
        "type": "relative", "relation": "after", "anchorPluginId": "conversation-surface",
    }}}
    files[0] = plugin_source("manifest.json", json.dumps(manifest))

    with pytest.raises(SourceCreationError) as captured:
        asyncio.run(creation.create("task-status", files))
    assert captured.value.code == "PLUGIN_PLACEMENT_INELIGIBLE"
    assert captured.value.details["diagnostic"]["code"] == diagnostic_code
    assert ("Reissue create_ui_plugin" in str(captured.value)) is expects_retry_hint
    assert activity.revision == 0
    assert not (tmp_path / "plugins/task-status").exists()
    assert control.calls == [{
        "app_ui_model_hash": "model",
        "capability_catalog_revision": "catalog",
        "instance_id": "task-status-main",
        "manifest": manifest,
    }]
    control.eligible = True
    result = asyncio.run(creation.create("task-status", files))
    assert result.plugin_id == "task-status"
    assert (tmp_path / "plugins/task-status/manifest.json").exists()


def test_create_ui_plugin_rejects_invalid_project_definition_before_atomic_write(tmp_path):
    source_creation, activity = service(tmp_path)
    contract = tmp_path / "framework/contracts/ui-plugin.ts"
    contract.parent.mkdir(parents=True)
    contract.write_text("export interface UIPluginDefinition { Component: unknown }\n")

    class Authority:
        def require_create(self, plugin_id):
            assert plugin_id == "task-status"

    creation = UIPluginCreationService(
        project_root=tmp_path,
        source_creation=source_creation,
        activity=activity,
        development_authority=Authority(),
    )
    files = plugin_sources()
    files[1] = plugin_source(
        "definition.ts",
        'import { defineUIPlugin } from "../../framework/contracts/ui-plugin";\n'
        'export default defineUIPlugin({ manifest: {}, component: null, '
        'services: { optionalInject: [] } });\n',
    )

    with pytest.raises(SourceCreationError) as captured:
        asyncio.run(creation.create("task-status", files))

    assert captured.value.code == "PLUGIN_DEFINITION_CONTRACT_INVALID"
    assert "Component (capital C)" in str(captured.value)
    assert activity.revision == 0
    assert not (tmp_path / "plugins/task-status").exists()


@pytest.mark.parametrize("filter_state,active_label", [
    ("pendingOnly", "showPendingOnly"),
    ("incompleteOnly", "showIncompleteOnly"),
])
def test_create_ui_plugin_rejects_reversed_pending_filter_label_before_write(
    tmp_path, filter_state, active_label
):
    source_creation, activity = service(tmp_path)

    class Authority:
        def require_create(self, plugin_id):
            assert plugin_id == "task-status"

        def mark_created(self, plugin_id):
            assert plugin_id == "task-status"

    creation = UIPluginCreationService(
        project_root=tmp_path,
        source_creation=source_creation,
        activity=activity,
        development_authority=Authority(),
    )
    files = plugin_sources()
    files[2] = plugin_source("index.tsx", (
        f"const label = {filter_state} ? labels.{active_label} : labels.showAll;\n"
    ))

    with pytest.raises(SourceCreationError) as captured:
        asyncio.run(creation.create("task-status", files))

    assert captured.value.code == "PLUGIN_FILTER_LABEL_REVERSED"
    assert "retry create_ui_plugin" in str(captured.value)
    assert activity.revision == 0
    assert not (tmp_path / "plugins/task-status").exists()

    files[2] = plugin_source("index.tsx", (
        f"const label = {filter_state} ? labels.showAll : labels.{active_label};\n"
    ))
    assert asyncio.run(creation.create("task-status", files)).plugin_id == "task-status"

def test_create_ui_plugin_rejects_local_state_as_ag_ui_data(tmp_path):
    creation, activity = plugin_service(tmp_path)
    files = plugin_sources()
    files[0] = plugin_source("manifest.json", json.dumps({
        "id": "task-status", "data": {"state": {"checked": "boolean[]"}},
    }))

    with pytest.raises(SourceCreationError) as captured:
        asyncio.run(creation.create("task-status", files))

    assert captured.value.code == "PLUGIN_MANIFEST_DATA_INVALID"
    assert activity.revision == 0
    assert not (tmp_path / "plugins/task-status").exists()

    files[0] = plugin_source("manifest.json", json.dumps({
        "id": "task-status", "data": {"state": False},
    }))
    assert asyncio.run(creation.create("task-status", files)).plugin_id == "task-status"


def test_create_ui_plugin_declares_builtin_hook_services_before_writing(tmp_path):
    creation, activity = plugin_service(tmp_path)
    files = plugin_sources()
    files[2] = plugin_source(
        "index.tsx",
        'import { useAgentUIThemeMode } from "../../agent-ui/theme/useAgentUITheme";\n'
        'export function TaskStatus() { useAgentUIThemeMode(); return null; }\n',
    )

    with pytest.raises(SourceCreationError) as captured:
        asyncio.run(creation.create("task-status", files))

    assert captured.value.code == "PLUGIN_BUILTIN_SERVICE_UNDECLARED"
    assert captured.value.details["service"] == "AGENT_UI_THEME_SERVICE"
    assert activity.revision == 0
    assert not (tmp_path / "plugins/task-status").exists()

    files[1] = plugin_source(
        "definition.ts",
        'import { AGENT_UI_THEME_SERVICE } from "../../services/agent-ui-theme";\n'
        'export default { optionalInject: [AGENT_UI_THEME_SERVICE] };\n',
    )
    assert asyncio.run(creation.create("task-status", files)).plugin_id == "task-status"


@pytest.mark.parametrize(
    ("plugin_id", "files", "expected_code"),
    [
        (
            "task-status",
            [plugin_source("../other/manifest.json", '{"id":"task-status"}\n')],
            "PLUGIN_PATH_INVALID",
        ),
        (
            "task-status",
            plugin_sources()[1:],
            "PLUGIN_REQUIRED_FILE_MISSING",
        ),
        (
            "task-status",
            [plugin_sources()[0], plugin_sources()[2]],
            "PLUGIN_REQUIRED_FILE_MISSING",
        ),
        (
            "task-status",
            plugin_sources()[:-1],
            "PLUGIN_REQUIRED_FILE_MISSING",
        ),
        (
            "task-status",
            [
                plugin_source("manifest.json", "not-json"),
                *plugin_sources()[1:],
            ],
            "PLUGIN_MANIFEST_INVALID",
        ),
        (
            "task-status",
            [
                plugin_source("manifest.json", "[]"),
                *plugin_sources()[1:],
            ],
            "PLUGIN_MANIFEST_INVALID",
        ),
        (
            "task-status",
            [
                plugin_source("manifest.json", '{"id":"other"}\n'),
                *plugin_sources()[1:],
            ],
            "PLUGIN_MANIFEST_ID_MISMATCH",
        ),
    ],
)
def test_create_ui_plugin_rejects_invalid_domain_payloads(
    tmp_path, plugin_id, files, expected_code
):
    creation, activity = plugin_service(tmp_path)

    with pytest.raises(SourceCreationError) as captured:
        asyncio.run(creation.create(plugin_id, files))

    assert captured.value.code == expected_code
    assert activity.revision == 0


@pytest.mark.parametrize("plugin_id", ["", "TaskStatus", "task_status", "a/b", ".."])
def test_create_ui_plugin_rejects_invalid_plugin_id(tmp_path, plugin_id):
    creation, activity = plugin_service(tmp_path)

    with pytest.raises(SourceCreationError) as captured:
        asyncio.run(creation.create(plugin_id, plugin_sources()))

    assert captured.value.code == "PLUGIN_ID_INVALID"
    assert activity.revision == 0


def test_create_ui_plugin_rejects_existing_target_directory(tmp_path):
    (tmp_path / "plugins/task-status").mkdir(parents=True)
    creation, activity = plugin_service(tmp_path)

    with pytest.raises(SourceCreationError) as captured:
        asyncio.run(creation.create("task-status", plugin_sources()))

    assert captured.value.code == "PLUGIN_ALREADY_EXISTS"
    assert activity.revision == 0


def test_create_ui_plugin_rolls_back_partial_failure(tmp_path, monkeypatch):
    creation, activity = plugin_service(tmp_path)
    from agent_ui_creator.source_tools import source_creation_service as module

    real_create = module.create_creator_file_atomically
    calls = 0

    def fail_second(project_root, file_path, content):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise OSError("simulated disk failure")
        real_create(project_root, file_path, content)

    monkeypatch.setattr(module, "create_creator_file_atomically", fail_second)

    with pytest.raises(SourceCreationError) as captured:
        asyncio.run(creation.create("task-status", plugin_sources()))

    assert captured.value.code == "SOURCE_CREATION_FAILED"
    assert not (tmp_path / "plugins/task-status").exists()
    assert activity.revision == 0


def test_created_plugin_is_undoable(tmp_path):
    creation, activity = plugin_service(tmp_path)

    asyncio.run(creation.create("task-status", plugin_sources()))
    receipt = activity.finish()

    assert receipt["transaction"] == {
        "runId": "source-create",
        "undoable": True,
    }
    assert activity.transactions.load("source-create").created_directories == (
        "plugins",
        "plugins/task-status",
    )
    activity.transactions.undo("source-create")
    assert not (tmp_path / "plugins/task-status").exists()
    assert not (tmp_path / "plugins").exists()


def test_created_plugin_undo_restores_absent_plugin_directory(tmp_path):
    creation, activity = plugin_service(tmp_path)
    files = [*plugin_sources(), plugin_source("components/Status.tsx")]

    asyncio.run(creation.create("task-status", files))
    assert (tmp_path / "plugins/task-status/components").is_dir()
    activity.finish()

    activity.transactions.undo("source-create")

    assert not (tmp_path / "plugins/task-status").exists()


def test_created_plugin_can_be_recreated_after_undo(tmp_path):
    creation, activity = plugin_service(tmp_path)

    asyncio.run(creation.create("task-status", plugin_sources()))
    activity.finish()
    activity.transactions.undo("source-create")

    recreated, recreated_activity = plugin_service(tmp_path, "source-recreate")
    result = asyncio.run(recreated.create("task-status", plugin_sources()))

    assert result.plugin_id == "task-status"
    assert recreated_activity.revision == 3


def test_plugin_undo_does_not_remove_user_added_files(tmp_path):
    creation, activity = plugin_service(tmp_path)

    asyncio.run(creation.create("task-status", plugin_sources()))
    activity.finish()
    user_file = tmp_path / "plugins/task-status/user-note.txt"
    user_file.write_text("keep me\n", encoding="utf-8")

    activity.transactions.undo("source-create")

    assert user_file.read_text(encoding="utf-8") == "keep me\n"
    assert (tmp_path / "plugins/task-status").is_dir()


def test_create_source_rejects_existing_path_without_partial_write(tmp_path):
    target = tmp_path / "plugins/task-status/manifest.json"
    target.parent.mkdir(parents=True)
    target.write_text("existing\n", encoding="utf-8")
    creation, activity = service(tmp_path)

    with pytest.raises(SourceCreationError) as captured:
        asyncio.run(
            creation.create(
                [
                    source("/plugins/task-status/index.tsx"),
                    source("/plugins/task-status/manifest.json", "{}\n"),
                ]
            )
        )

    assert captured.value.code == "SOURCE_FILE_ALREADY_EXISTS"
    assert not (tmp_path / "plugins/task-status/index.tsx").exists()
    assert target.read_text(encoding="utf-8") == "existing\n"
    assert activity.revision == 0


def test_create_source_rolls_back_partial_failure(tmp_path, monkeypatch):
    creation, activity = service(tmp_path)
    from agent_ui_creator.source_tools import source_creation_service as module

    real_create = module.create_creator_file_atomically
    calls = 0

    def fail_second(project_root, file_path, content):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise OSError("simulated disk failure")
        real_create(project_root, file_path, content)

    monkeypatch.setattr(module, "create_creator_file_atomically", fail_second)

    with pytest.raises(SourceCreationError) as captured:
        asyncio.run(
            creation.create(
                [
                    source("/plugins/task-status/manifest.json", "{}\n"),
                    source("/plugins/task-status/index.tsx"),
                ]
            )
        )

    assert captured.value.code == "SOURCE_CREATION_FAILED"
    assert not (tmp_path / "plugins/task-status/manifest.json").exists()
    assert not (tmp_path / "plugins/task-status/index.tsx").exists()
    assert activity.revision == 0


def assert_source_path_denied(tmp_path: Path, path: str) -> None:
    creation, activity = service(tmp_path)

    with pytest.raises(SourceCreationError) as captured:
        asyncio.run(creation.create([source(path, "{}\n")]))

    assert captured.value.code == "SOURCE_PATH_DENIED"
    assert activity.revision == 0


def test_create_source_denies_registry(tmp_path):
    assert_source_path_denied(tmp_path, "/plugins/registry.generated.ts")


def test_create_source_denies_app_ui(tmp_path):
    assert_source_path_denied(tmp_path, "/app-ui/app-ui.json")


def test_created_source_is_undoable(tmp_path):
    creation, activity = service(tmp_path)
    target = tmp_path / "services/task-status.ts"

    asyncio.run(creation.create([source("/services/task-status.ts")]))
    receipt = activity.finish()

    assert receipt["transaction"] == {
        "runId": "source-create",
        "undoable": True,
    }
    assert activity.transactions.load("source-create").created_directories == ("services",)
    activity.transactions.undo("source-create")
    assert not target.exists()


class CapturingModel(FakeMessagesListChatModel):
    def bind_tools(self, tools, **kwargs):
        object.__setattr__(self, "bound_tool_names", [tool.name for tool in tools])
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        object.__setattr__(self, "seen_messages", list(messages))
        return super()._generate(
            messages, stop=stop, run_manager=run_manager, **kwargs
        )


def call(name, arguments, call_id):
    return AIMessage(
        content="",
        tool_calls=[{"name": name, "args": arguments, "id": call_id}],
    )


def test_domain_write_hides_create_until_development_is_authorized(tmp_path):
    model = CapturingModel(responses=[AIMessage(content="No change needed.")])
    agent = create_domain_write_creator_agent(
        model=model,
        workspace=tmp_path,
        skills_root=SKILLS_ROOT,
    )

    asyncio.run(agent.run("Inspect whether a change is needed."))

    assert set(model.bound_tool_names) == set(ALLOWED_DOMAIN_WRITE_TOOLS) - {
        "create_ui_plugin", "inspect_runtime_errors", "inspect_runtime_layout", "verify_ui_plugin_behavior",
    }
    assert "create_ui_plugin" not in model.bound_tool_names
    assert "prepare_ui_plugin_development" in model.bound_tool_names
    assert "create_ui_source_files" not in model.bound_tool_names
    assert "write_file" not in model.bound_tool_names
    assert "execute" not in model.bound_tool_names


def test_create_source_is_side_effect_exclusive():
    create = call(
        "create_ui_plugin",
        {
            "pluginId": "x",
            "files": [{"relativePath": "index.tsx", "content": "x"}],
        },
        "create",
    )
    read = call("read_file", {"file_path": "/plugins/x/index.tsx"}, "read")

    assert is_valid_domain_tool_batch(ModelResponse(result=[create]))
    assert not is_valid_domain_tool_batch(
        ModelResponse(
            result=[
                AIMessage(
                    content="",
                    tool_calls=[create.tool_calls[0], read.tool_calls[0]],
                )
            ]
        )
    )


def test_domain_write_loads_plugin_development_skill(tmp_path):
    model = CapturingModel(responses=[AIMessage(content="Skill discovered.")])
    agent = create_domain_write_creator_agent(
        model=model,
        workspace=tmp_path,
        skills_root=SKILLS_ROOT,
    )

    asyncio.run(agent.run("Which Skill covers UI Plugin development?"))

    system_text = "\n".join(
        str(message.content)
        for message in model.seen_messages
        if isinstance(message, SystemMessage)
    )
    assert "ui-plugin-development" in system_text
    assert "/skills/ui-plugin-development/SKILL.md" in system_text


def test_plugin_skill_uses_python_project_root_paths(tmp_path):
    framework = tmp_path / "framework/contracts/ui-plugin.ts"
    plugin = tmp_path / "plugins/example/index.tsx"
    framework.parent.mkdir(parents=True)
    plugin.parent.mkdir(parents=True)
    framework.write_text("export const contractMarker = true;\n", encoding="utf-8")
    plugin.write_text("export const pluginMarker = true;\n", encoding="utf-8")
    model = CapturingModel(
        responses=[
            call(
                "read_file",
                {"file_path": "/skills/ui-plugin-development/SKILL.md"},
                "read-skill",
            ),
            AIMessage(
                content="",
                tool_calls=[
                    call(
                        "read_file",
                        {"file_path": "/framework/contracts/ui-plugin.ts"},
                        "read-contract",
                    ).tool_calls[0],
                    call(
                        "read_file",
                        {"file_path": "/plugins/example/index.tsx"},
                        "read-plugin",
                    ).tool_calls[0],
                ],
            ),
            AIMessage(content="[creator-verification:read-only]Skill paths read."),
        ]
    )
    agent = create_domain_write_creator_agent(
        model=model,
        workspace=tmp_path,
        skills_root=SKILLS_ROOT,
    )

    result = asyncio.run(agent.run("Load the Plugin development Skill and inspect its paths."))
    observed_text = "\n".join(str(message.content) for message in model.seen_messages)

    assert "contractMarker" in observed_text
    assert "pluginMarker" in observed_text
    assert "/project/" not in (
        SKILLS_ROOT / "ui-plugin-development/SKILL.md"
    ).read_text(encoding="utf-8")
    assert result.text == "Skill paths read."
