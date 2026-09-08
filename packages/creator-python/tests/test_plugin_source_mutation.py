from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest
from langchain.agents.middleware import ModelResponse
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage
from pydantic import ValidationError

from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.app_ui_model import ProjectMutationCoordinator
from agent_ui_creator.domain_agent import (
    ALLOWED_DOMAIN_WRITE_TOOLS,
    create_domain_write_creator_agent,
)
from agent_ui_creator.domain_agent.tool_batch_policy import is_valid_domain_tool_batch
from agent_ui_creator.source_tools import (
    MutateUIPluginSourceInput,
    PluginSourceMutationError,
    UIPluginSourceMutationService,
)


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
SKILLS_ROOT = REPOSITORY_ROOT / "packages" / "creator" / "skills"


def make_plugin(root: Path) -> None:
    plugin = root / "plugins/task-status"
    plugin.mkdir(parents=True)
    (plugin / "manifest.json").write_text(
        '{"id":"task-status","name":"Task Status"}\n', encoding="utf-8"
    )
    (plugin / "definition.ts").write_text("export {};\n", encoding="utf-8")
    (plugin / "index.tsx").write_text(
        "export function TaskStatus() { return <section>Ready</section>; }\n",
        encoding="utf-8",
    )
    (plugin / "styles.css").write_text(
        ".status { padding: 8px; }\n", encoding="utf-8"
    )


def make_service(root: Path, run_id: str = "plugin-mutation"):
    make_plugin(root)
    activity = CreatorActivityRecorder(root)
    activity.begin(run_id)
    return (
        UIPluginSourceMutationService(
            project_root=root,
            activity=activity,
            mutation_coordinator=ProjectMutationCoordinator(),
        ),
        activity,
    )


def changes(*values):
    return MutateUIPluginSourceInput.model_validate(
        {"pluginId": "task-status", "changes": list(values)}
    ).changes


def edit(relative_path: str, old: str, new: str, *, replace_all: bool = False):
    return {
        "type": "edit",
        "relativePath": relative_path,
        "edits": [
            {
                "oldText": old,
                "newText": new,
                "replaceAll": replace_all,
            }
        ],
    }


def create(relative_path: str, content: str = "export {};\n"):
    return {"type": "create", "relativePath": relative_path, "content": content}


def observe(activity: CreatorActivityRecorder, *relative_paths: str) -> None:
    for relative_path in relative_paths:
        activity.file_observations.observe(
            f"/plugins/task-status/{relative_path}"
        )


def test_mutates_two_existing_files_atomically_and_records_receipt(tmp_path):
    service, activity = make_service(tmp_path)
    observe(activity, "index.tsx", "styles.css")

    result = asyncio.run(
        service.mutate(
            "task-status",
            changes(
                edit("index.tsx", "<section>Ready</section>", "<section>Current Task</section>"),
                edit("styles.css", "padding: 8px", "padding: 12px"),
            ),
        )
    )
    receipt = activity.finish()

    assert result.to_dict() == {
        "pluginId": "task-status",
        "changed": True,
        "changedPaths": [
            "plugins/task-status/index.tsx",
            "plugins/task-status/styles.css",
        ],
        "modifiedPaths": [
            "plugins/task-status/index.tsx",
            "plugins/task-status/styles.css",
        ],
        "createdPaths": [],
        "mutationRevision": 2,
    }
    assert [file["status"] for file in receipt["files"]] == ["modified", "modified"]
    assert receipt["transaction"]["undoable"] is True


def test_mutates_existing_file_and_creates_nested_file_with_undo(tmp_path):
    service, activity = make_service(tmp_path)
    observe(activity, "index.tsx")

    result = asyncio.run(
        service.mutate(
            "task-status",
            changes(
                edit("index.tsx", "Ready", "Current Task"),
                create("components/details/StatusBadge.tsx"),
            ),
        )
    )
    activity.finish()

    assert result.modified_paths == ("plugins/task-status/index.tsx",)
    assert result.created_paths == (
        "plugins/task-status/components/details/StatusBadge.tsx",
    )
    assert activity.transactions.load("plugin-mutation").created_directories == (
        "plugins/task-status/components",
        "plugins/task-status/components/details",
    )

    activity.transactions.undo("plugin-mutation")

    assert "Ready" in (tmp_path / "plugins/task-status/index.tsx").read_text()
    assert not (tmp_path / "plugins/task-status/components").exists()


def test_stale_one_file_rejects_entire_mutation_without_writes(tmp_path):
    service, activity = make_service(tmp_path)
    observe(activity, "index.tsx", "styles.css")
    (tmp_path / "plugins/task-status/styles.css").write_text(
        ".status { padding: 10px; }\n", encoding="utf-8"
    )

    with pytest.raises(PluginSourceMutationError) as captured:
        asyncio.run(
            service.mutate(
                "task-status",
                changes(
                    edit("index.tsx", "Ready", "Current Task"),
                    edit("styles.css", "padding: 8px", "padding: 12px"),
                ),
            )
        )

    assert captured.value.code == "PLUGIN_SOURCE_STALE_VERSION"
    assert "Ready" in (tmp_path / "plugins/task-status/index.tsx").read_text()
    assert "10px" in (tmp_path / "plugins/task-status/styles.css").read_text()
    assert activity.revision == 0


def test_unread_existing_file_rejects_entire_mutation(tmp_path):
    service, activity = make_service(tmp_path)
    observe(activity, "index.tsx")

    with pytest.raises(PluginSourceMutationError) as captured:
        asyncio.run(
            service.mutate(
                "task-status",
                changes(
                    edit("index.tsx", "Ready", "Current Task"),
                    edit("styles.css", "8px", "12px"),
                ),
            )
        )

    assert captured.value.code == "PLUGIN_SOURCE_OBSERVATION_REQUIRED"
    assert "Ready" in (tmp_path / "plugins/task-status/index.tsx").read_text()
    assert activity.revision == 0


def test_plugin_must_exist_before_mutation(tmp_path):
    service, activity = make_service(tmp_path)
    missing = MutateUIPluginSourceInput.model_validate(
        {"pluginId": "missing-plugin", "changes": [create("index.tsx")]}
    )

    with pytest.raises(PluginSourceMutationError) as captured:
        asyncio.run(service.mutate(missing.pluginId, missing.changes))

    assert captured.value.code == "PLUGIN_NOT_FOUND"
    assert not (tmp_path / "plugins/missing-plugin").exists()
    assert activity.revision == 0


def test_missing_edit_target_reports_file_not_found_after_current_run_read(tmp_path):
    service, activity = make_service(tmp_path)
    observe(activity, "components/Missing.tsx")

    with pytest.raises(PluginSourceMutationError) as captured:
        asyncio.run(
            service.mutate(
                "task-status",
                changes(edit("components/Missing.tsx", "before", "after")),
            )
        )

    assert captured.value.code == "PLUGIN_SOURCE_FILE_NOT_FOUND"
    assert activity.revision == 0


def test_duplicate_normalized_paths_are_rejected(tmp_path):
    service, activity = make_service(tmp_path)
    observe(activity, "index.tsx")

    with pytest.raises(PluginSourceMutationError) as captured:
        asyncio.run(
            service.mutate(
                "task-status",
                changes(
                    edit("index.tsx", "Ready", "Running"),
                    edit("./index.tsx", "Ready", "Current Task"),
                ),
            )
        )

    assert captured.value.code == "PLUGIN_SOURCE_FILE_DUPLICATE"
    assert activity.revision == 0


def test_delete_operation_is_not_in_the_tool_schema():
    with pytest.raises(ValidationError):
        MutateUIPluginSourceInput.model_validate(
            {
                "pluginId": "task-status",
                "changes": [{"type": "delete", "relativePath": "index.tsx"}],
            }
        )


@pytest.mark.parametrize(
    ("content", "old", "expected_code"),
    [
        ("Ready\n", "Missing", "PLUGIN_SOURCE_EDIT_TARGET_NOT_FOUND"),
        ("Ready Ready\n", "Ready", "PLUGIN_SOURCE_EDIT_TARGET_AMBIGUOUS"),
    ],
)
def test_exact_replacement_failure_has_zero_writes(
    tmp_path, content, old, expected_code
):
    service, activity = make_service(tmp_path)
    target = tmp_path / "plugins/task-status/index.tsx"
    target.write_text(content, encoding="utf-8")
    observe(activity, "index.tsx")

    with pytest.raises(PluginSourceMutationError) as captured:
        asyncio.run(
            service.mutate(
                "task-status", changes(edit("index.tsx", old, "Changed"))
            )
        )

    assert captured.value.code == expected_code
    assert target.read_text(encoding="utf-8") == content
    assert activity.revision == 0


def test_replace_all_is_explicit(tmp_path):
    service, activity = make_service(tmp_path)
    target = tmp_path / "plugins/task-status/index.tsx"
    target.write_text("Ready Ready\n", encoding="utf-8")
    observe(activity, "index.tsx")

    asyncio.run(
        service.mutate(
            "task-status",
            changes(edit("index.tsx", "Ready", "Running", replace_all=True)),
        )
    )

    assert target.read_text(encoding="utf-8") == "Running Running\n"


def test_manifest_id_change_rejects_all_files(tmp_path):
    service, activity = make_service(tmp_path)
    observe(activity, "manifest.json", "index.tsx")

    with pytest.raises(PluginSourceMutationError) as captured:
        asyncio.run(
            service.mutate(
                "task-status",
                changes(
                    edit("manifest.json", '"task-status"', '"task-status-v2"'),
                    edit("index.tsx", "Ready", "Current Task"),
                ),
            )
        )

    assert captured.value.code == "PLUGIN_SOURCE_MANIFEST_ID_MISMATCH"
    assert json.loads(
        (tmp_path / "plugins/task-status/manifest.json").read_text()
    )["id"] == "task-status"
    assert "Ready" in (tmp_path / "plugins/task-status/index.tsx").read_text()
    assert activity.revision == 0


@pytest.mark.parametrize("manifest", ["not-json", "[]"])
def test_invalid_manifest_rejects_mutation_before_any_write(tmp_path, manifest):
    service, activity = make_service(tmp_path)
    observe(activity, "manifest.json", "index.tsx")

    with pytest.raises(PluginSourceMutationError) as captured:
        asyncio.run(
            service.mutate(
                "task-status",
                changes(
                    edit(
                        "manifest.json",
                        (tmp_path / "plugins/task-status/manifest.json").read_text(),
                        manifest,
                    ),
                    edit("index.tsx", "Ready", "Current Task"),
                ),
            )
        )

    assert captured.value.code == "PLUGIN_SOURCE_MANIFEST_INVALID"
    assert "Ready" in (tmp_path / "plugins/task-status/index.tsx").read_text()
    assert activity.revision == 0


def test_existing_create_target_rejects_all_files(tmp_path):
    service, activity = make_service(tmp_path)
    existing = tmp_path / "plugins/task-status/components/X.tsx"
    existing.parent.mkdir()
    existing.write_text("user file\n", encoding="utf-8")
    observe(activity, "index.tsx")

    with pytest.raises(PluginSourceMutationError) as captured:
        asyncio.run(
            service.mutate(
                "task-status",
                changes(
                    edit("index.tsx", "Ready", "Current Task"),
                    create("components/X.tsx"),
                ),
            )
        )

    assert captured.value.code == "PLUGIN_SOURCE_FILE_ALREADY_EXISTS"
    assert "Ready" in (tmp_path / "plugins/task-status/index.tsx").read_text()
    assert existing.read_text() == "user file\n"
    assert activity.revision == 0


def test_commit_failure_rolls_back_every_applied_file(tmp_path, monkeypatch):
    service, activity = make_service(tmp_path)
    observe(activity, "index.tsx", "styles.css")
    from agent_ui_creator.source_tools import plugin_mutation_service as module

    real_replace = module.replace_creator_file_atomically
    calls = 0

    def fail_second(project_root, file_path, content, expected=None):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise OSError("simulated disk failure")
        real_replace(project_root, file_path, content, expected)

    monkeypatch.setattr(module, "replace_creator_file_atomically", fail_second)

    with pytest.raises(PluginSourceMutationError) as captured:
        asyncio.run(
            service.mutate(
                "task-status",
                changes(
                    edit("index.tsx", "Ready", "Current Task"),
                    edit("styles.css", "8px", "12px"),
                ),
            )
        )

    assert captured.value.code == "PLUGIN_SOURCE_MUTATION_FAILED"
    assert "Ready" in (tmp_path / "plugins/task-status/index.tsx").read_text()
    assert "8px" in (tmp_path / "plugins/task-status/styles.css").read_text()
    assert activity.revision == 0


def test_incomplete_rollback_reconciles_real_residual_for_undo(tmp_path, monkeypatch):
    service, activity = make_service(tmp_path)
    observe(activity, "index.tsx", "styles.css")
    from agent_ui_creator.source_tools import plugin_mutation_service as module

    real_replace = module.replace_creator_file_atomically

    def fail_commit_and_rollback(project_root, file_path, content, expected=None):
        if file_path.endswith("styles.css") and "12px" in content:
            raise OSError("simulated commit failure")
        if file_path.endswith("index.tsx") and "Ready" in content:
            raise OSError("simulated rollback failure")
        real_replace(project_root, file_path, content, expected)

    monkeypatch.setattr(
        module, "replace_creator_file_atomically", fail_commit_and_rollback
    )

    with pytest.raises(PluginSourceMutationError) as captured:
        asyncio.run(
            service.mutate(
                "task-status",
                changes(
                    edit("index.tsx", "Ready", "Current Task"),
                    edit("styles.css", "8px", "12px"),
                ),
            )
        )

    assert captured.value.code == "PLUGIN_SOURCE_MUTATION_ROLLBACK_FAILED"
    assert "Current Task" in (tmp_path / "plugins/task-status/index.tsx").read_text()
    assert activity.revision == 1
    receipt = activity.finish()
    assert [file["path"] for file in receipt["files"]] == [
        "plugins/task-status/index.tsx"
    ]
    activity.transactions.undo("plugin-mutation")
    assert "Ready" in (tmp_path / "plugins/task-status/index.tsx").read_text()


def test_undo_preserves_user_file_added_to_created_directory(tmp_path):
    service, activity = make_service(tmp_path)

    asyncio.run(
        service.mutate(
            "task-status", changes(create("components/Generated.tsx"))
        )
    )
    activity.finish()
    user_file = tmp_path / "plugins/task-status/components/user-note.txt"
    user_file.write_text("keep me\n", encoding="utf-8")

    activity.transactions.undo("plugin-mutation")

    assert not (tmp_path / "plugins/task-status/components/Generated.tsx").exists()
    assert user_file.read_text() == "keep me\n"
    assert user_file.parent.is_dir()


def test_source_noop_does_not_advance_or_record_semantic_noop(tmp_path):
    service, activity = make_service(tmp_path)
    observe(activity, "index.tsx")

    result = asyncio.run(
        service.mutate(
            "task-status", changes(edit("index.tsx", "Ready", "Ready"))
        )
    )

    assert result.to_dict()["changed"] is False
    assert result.changed_paths == ()
    assert result.mutation_revision == activity.revision == 0
    assert activity.semantic_noop is None


@pytest.mark.parametrize(
    "relative_path",
    [
        "../other/index.tsx",
        "/plugins/task-status/index.tsx",
        "C:/plugins/task-status/index.tsx",
        "components\\X.tsx",
        "",
        "index.tsx\x00",
    ],
)
def test_rejects_unsafe_relative_paths(tmp_path, relative_path):
    service, activity = make_service(tmp_path)

    with pytest.raises((PluginSourceMutationError, ValueError)) as captured:
        asyncio.run(
            service.mutate(
                "task-status", changes(create(relative_path))
            )
        )

    if isinstance(captured.value, PluginSourceMutationError):
        assert captured.value.code == "PLUGIN_SOURCE_PATH_INVALID"
    assert activity.revision == 0


class CapturingModel(FakeMessagesListChatModel):
    def bind_tools(self, tools, **kwargs):
        object.__setattr__(self, "bound_tool_names", [tool.name for tool in tools])
        return self


def call(name, arguments, call_id):
    return AIMessage(
        content="",
        tool_calls=[{"name": name, "args": arguments, "id": call_id}],
    )


def test_domain_write_exposes_mutation_as_side_effect_exclusive(tmp_path):
    model = CapturingModel(responses=[AIMessage(content="No change needed.")])
    agent = create_domain_write_creator_agent(
        model=model,
        workspace=tmp_path,
        skills_root=SKILLS_ROOT,
    )
    asyncio.run(agent.run("Inspect whether a change is needed."))

    assert set(model.bound_tool_names) == set(ALLOWED_DOMAIN_WRITE_TOOLS)
    assert "mutate_ui_plugin_source" in model.bound_tool_names

    mutation = call(
        "mutate_ui_plugin_source",
        {
            "pluginId": "task-status",
            "changes": [edit("index.tsx", "Ready", "Running")],
        },
        "mutate",
    )
    read = call("read_file", {"file_path": "/plugins/task-status/index.tsx"}, "read")
    assert is_valid_domain_tool_batch(ModelResponse(result=[mutation]))
    assert not is_valid_domain_tool_batch(
        ModelResponse(
            result=[
                AIMessage(
                    content="",
                    tool_calls=[mutation.tool_calls[0], read.tool_calls[0]],
                )
            ]
        )
    )
