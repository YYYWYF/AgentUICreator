from __future__ import annotations

import asyncio
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
from agent_ui_creator.source_tools import (
    SourceCreationError,
    UISourceCreationService,
    UISourceFile,
)


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
SKILLS_ROOT = REPOSITORY_ROOT / "packages" / "creator" / "skills"


def source(path: str, content: str = "export {};\n") -> UISourceFile:
    return UISourceFile(path=path, content=content)


def service(tmp_path: Path):
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("source-create")
    return (
        UISourceCreationService(
            project_root=tmp_path,
            activity=activity,
            mutation_coordinator=ProjectMutationCoordinator(),
        ),
        activity,
    )


def test_create_multiple_plugin_files_atomically(tmp_path):
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


def test_domain_write_exposes_create_ui_source_files(tmp_path):
    model = CapturingModel(responses=[AIMessage(content="No change needed.")])
    agent = create_domain_write_creator_agent(
        model=model,
        workspace=tmp_path,
        skills_root=SKILLS_ROOT,
    )

    asyncio.run(agent.run("Inspect whether a change is needed."))

    assert set(model.bound_tool_names) == set(ALLOWED_DOMAIN_WRITE_TOOLS)
    assert "create_ui_source_files" in model.bound_tool_names
    assert "write_file" not in model.bound_tool_names
    assert "execute" not in model.bound_tool_names


def test_create_source_is_side_effect_exclusive():
    create = call(
        "create_ui_source_files",
        {"files": [{"path": "/plugins/x/index.tsx", "content": "x"}]},
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
