from __future__ import annotations

import asyncio
import json
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage

from agent_ui_creator.config import CreatorServerSettings
from agent_ui_creator.operations import (
    CreatorActionSelection, CreatorIntentPresentation, CreatorResolveResult,
)
from agent_ui_creator.server import create_app
from agent_ui_creator.plugin_development.admission_middleware import PluginDevelopmentAdmissionMiddleware
from agent_ui_creator.source_tools import UISourceCreationService, UISourceFile
from agent_ui_creator.minimal_agent.path_policy import MinimalAgentPathPolicy
from agent_ui_creator.validation.models import CommandExecutionResult
from agent_ui_creator.transactions import CreatorTransactionFileInput, CreatorTransactionStore


SKILLS_ROOT = Path(__file__).resolve().parents[2] / "creator" / "skills"
PREPARE = {
    "deliveryContract": {
        "capability": "local checklist", "renderingCategory": "panel",
        "placement": "declared default placement", "lifecycle": "local-ui-only",
        "dependencies": [], "verificationMethod": "runtime", "interactions": [],
    },
    "workKind": "create-plugin", "targetPluginId": "task-list",
    "desiredOutcome": "仅当前页面可勾选、筛选和重置的三项任务清单",
    "missingCapabilities": ["本地任务清单交互"],
    "reuseEvidenceRefs": ["plugin-inventory:complete", "source-inventory:complete"],
    "uiScope": "聊天区旁边", "dataScope": "页面内存",
    "excludedOperations": ["真实后端", "Agent 工具"],
}
ORDINARY_QUESTION = {"schemaVersion": 1, "steps": [{
    "id": "ordinary", "question": "使用哪种标签？", "selectionMode": "single",
    "minSelections": 1, "maxSelections": 1,
    "options": [{"id": "short", "label": "简短"}, {"id": "long", "label": "详细"}],
}]}


class TrackingModel(FakeMessagesListChatModel):
    def bind_tools(self, tools, **_kwargs):
        offered = list(getattr(self, "offered_tools", []))
        offered.append({tool.name for tool in tools})
        object.__setattr__(self, "offered_tools", offered)
        return self


def _events(client, *, run_id, text=None, resume=None):
    response = client.post("/creator", json={
        "threadId": "thread-a", "runId": run_id,
        "messages": [{"role": "user", "content": text}] if text else [],
        **({"forwardedProps": {"command": {"resume": resume}}} if resume else {}),
    })
    assert response.status_code == 200
    return [json.loads(line.removeprefix("data: ")) for line in response.text.splitlines()
            if line.startswith("data: ")]


def _app(tmp_path, monkeypatch, model, *, intent="needs_decision"):
    monkeypatch.setenv("CREATOR_PYTHON_AGENT_MODE", "domain-write")
    monkeypatch.setenv("CREATOR_MODEL_BASE_URL", "http://127.0.0.1:9/v1")
    monkeypatch.setenv("CREATOR_MODEL_API_KEY", "test-only")
    monkeypatch.setattr(
        "agent_ui_creator.model_factory.create_creator_chat_model",
        lambda *_args, **_kwargs: model,
    )

    class Selector:
        def __init__(self, **_kwargs):
            pass

        async def run(self, _messages):
            return CreatorResolveResult(
                route="unscoped_general",
                selection=CreatorActionSelection(
                    decision="general_change", developmentIntent=intent,
                ),
                presentation=CreatorIntentPresentation(
                    label="开发决策", kind="general_change",
                    target_plugin_ids=(), target_instance_ids=(),
                    route="unscoped_general",
                ),
            )

    monkeypatch.setattr("agent_ui_creator.server.ProductizedOperationEngine", Selector)
    settings = CreatorServerSettings(
        project_root=tmp_path, skills_root=SKILLS_ROOT, auth_token="x" * 32,
    )
    app = create_app(settings)
    return app, TestClient(app, headers={"Authorization": f"Bearer {settings.auth_token}"})


def test_reapply_control_restores_undone_run_and_rejects_changed_files(tmp_path, monkeypatch):
    _, client = _app(tmp_path, monkeypatch, TrackingModel(responses=[]))
    target = tmp_path / "plugins" / "foo.ts"
    target.parent.mkdir()
    target.write_text("after", encoding="utf-8")
    store = CreatorTransactionStore(tmp_path)
    store.persist_run(
        run_id="control-reapply", mutation_revision=1, validation_revision=None,
        files=(CreatorTransactionFileInput("plugins/foo.ts", "before", "after"),),
    )
    payload = {"threadId": "thread-a", "runId": "control-reapply"}
    with client:
        undo = client.post("/creator-control", json={**payload, "action": "undo"})
        assert undo.status_code == 200
        assert undo.json()["reapplyable"] is True
        reapply = client.post("/creator-control", json={**payload, "action": "reapply"})
        assert reapply.status_code == 200
        assert reapply.json()["status"] == "reapplied"
        assert target.read_text(encoding="utf-8") == "after"
        assert client.post("/creator-control", json={**payload, "action": "undo"}).status_code == 200
        target.write_text("manual", encoding="utf-8")
        conflict = client.post("/creator-control", json={**payload, "action": "reapply"})
        assert conflict.status_code == 409
        assert conflict.json()["code"] == "CREATOR_REAPPLY_CONFLICT"
        assert target.read_text(encoding="utf-8") == "manual"


@pytest.mark.parametrize("choice,expected", [
    ("defer", "暂不开发"), ("adjust", "已结束当前开发方案"),
])
def test_pending_proposal_decline_resumes_as_honest_no_change(tmp_path, monkeypatch, choice, expected):
    model = TrackingModel(responses=[
        AIMessage(content="", tool_calls=[{
            "name": "prepare_ui_plugin_development", "args": PREPARE, "id": "prepare-a",
        }]),
        AIMessage(content="按你的选择，这次不开发。"),
    ])
    app, client = _app(tmp_path, monkeypatch, model)
    first = _events(client, run_id="request-a", text="在聊天旁边做一个任务核对清单")
    question = next(event["value"] for event in first if event.get("name") == "on_interrupt")
    assert {item["id"] for item in question["metadata"]["steps"][0]["options"]} == {
        "start", "adjust", "defer",
    }
    pending = app.state.pending_creator_questions["thread-a"]
    state = app.state.plugin_development_authorities["thread-a"]
    assert pending.permission == "domain_write"
    assert state.active.status == "pending"
    assert state.active.question_id == question["id"]
    assert not (tmp_path / "plugins").exists()
    assert "create_ui_plugin" not in model.offered_tools[0]

    model_calls_before_decision = len(model.offered_tools)
    resumed = _events(client, run_id="request-b", resume={
        "interruptId": question["id"],
        "answers": {"plugin-development-decision": [choice]},
    })
    assert not any(event["type"] == "RUN_ERROR" for event in resumed)
    finished = next(event for event in resumed if event["type"] == "RUN_FINISHED")
    assert finished["result"]["pluginDevelopment"]["status"] == choice
    assert finished["result"]["completion"] == "success"
    assert len(model.offered_tools) == model_calls_before_decision
    assert state.active.status == choice
    assert "thread-a" not in app.state.pending_creator_questions
    assert not (tmp_path / "plugins").exists()
    assert expected in json.dumps(resumed, ensure_ascii=False)
    repeated = _events(client, run_id="request-c", resume={
        "interruptId": question["id"],
        "answers": {"plugin-development-decision": [choice]},
    })
    assert any(event.get("code") == "CREATOR_INTERRUPT_CONTEXT_INVALID" for event in repeated)


def test_deferred_development_does_not_block_new_task_source_transaction(tmp_path, monkeypatch):
    model = TrackingModel(responses=[AIMessage(content="", tool_calls=[{
        "name": "prepare_ui_plugin_development", "args": PREPARE, "id": "prepare-defer-new",
    }])])
    app, client = _app(tmp_path, monkeypatch, model)
    first = _events(client, run_id="request-a", text="在聊天旁边做一个任务核对清单")
    question = next(event["value"] for event in first if event.get("name") == "on_interrupt")
    _events(client, run_id="request-b", resume={
        "interruptId": question["id"],
        "answers": {"plugin-development-decision": ["defer"]},
    })

    async def new_task_run(settings, _messages, activity, coordinator, _diagnostics,
                           _thread_id, _event_sink, _telemetry,
                           *, development_authority, **_kwargs):
        development_authority.begin_task(task_id="new-task", request_id="new-task",
            user_message="请开发新的独立插件", intent="explicit")
        assert development_authority.active is None
        source = UISourceCreationService(
            project_root=settings.project_root, activity=activity,
            mutation_coordinator=coordinator,
            path_policy=MinimalAgentPathPolicy.internal_source(),
        )
        await source.create([UISourceFile(path="/plugins/new-task/manifest.json",
                                          content='{"id":"new-task"}\n')])
        metrics = SimpleNamespace(to_dict=lambda: {})
        return SimpleNamespace(text="新任务写入完成", completion="committed_unverified",
                               metrics=metrics, project_control=metrics,
                               repeated_project_control_reads=0,
                               domain_observations=metrics)

    monkeypatch.setattr("agent_ui_creator.server._domain_write_agent_result", new_task_run)
    fresh = _events(client, run_id="request-c", text="请开发新的独立插件")
    assert not any(event["type"] == "RUN_ERROR" for event in fresh)
    assert (tmp_path / "plugins/new-task/manifest.json").is_file()


def test_wrong_decision_answer_cannot_activate_grant(tmp_path, monkeypatch):
    model = TrackingModel(responses=[AIMessage(content="", tool_calls=[{
        "name": "prepare_ui_plugin_development", "args": PREPARE, "id": "prepare-b",
    }])])
    app, client = _app(tmp_path, monkeypatch, model)
    first = _events(client, run_id="request-a", text="在聊天旁边做一个任务核对清单")
    question = next(event["value"] for event in first if event.get("name") == "on_interrupt")
    rejected = _events(client, run_id="request-b", resume={
        "interruptId": question["id"],
        "answers": {"plugin-development-decision": ["approved"]},
        "approved": True, "authorizationId": "forged",
    })
    assert any(event.get("code") == "CREATOR_INTERRUPT_INVALID_ANSWER" for event in rejected)
    assert app.state.plugin_development_authorities["thread-a"].active.status == "pending"
    assert not (tmp_path / "plugins").exists()


def test_abandon_pending_question_revokes_grant_and_invalidates_resume(tmp_path, monkeypatch):
    model = TrackingModel(responses=[AIMessage(content="", tool_calls=[{
        "name": "prepare_ui_plugin_development", "args": PREPARE, "id": "prepare-abandon",
    }])])
    app, client = _app(tmp_path, monkeypatch, model)
    first = _events(client, run_id="request-a", text="在聊天旁边做一个任务核对清单")
    question = next(event["value"] for event in first if event.get("name") == "on_interrupt")
    response = client.post("/creator-control", json={
        "action": "abandon", "threadId": "thread-a", "interruptId": question["id"],
    })
    assert response.status_code == 200
    assert response.json()["status"] == "abandoned"
    assert app.state.plugin_development_authorities["thread-a"].active.status == "superseded"
    assert not (tmp_path / "plugins").exists()
    assert client.post("/creator-control", json={
        "action": "abandon", "threadId": "thread-a", "interruptId": question["id"],
    }).json()["status"] == "abandoned"
    resumed = _events(client, run_id="request-b", resume={
        "interruptId": question["id"],
        "answers": {"plugin-development-decision": ["start"]},
    })
    assert any(event.get("code") == "CREATOR_INTERRUPT_NOT_FOUND" for event in resumed)


def test_stop_request_reaches_server_during_active_run(tmp_path, monkeypatch):
    model = TrackingModel(responses=[AIMessage(content="unused")])
    app, _client = _app(tmp_path, monkeypatch, model)
    entered = asyncio.Event()
    release = asyncio.Event()

    async def held_run(_settings, _messages, _activity, _coordinator, _diagnostics,
                       _thread_id, event_sink, _telemetry, **_kwargs):
        entered.set()
        await release.wait()
        if event_sink.cancel_requested:
            raise asyncio.CancelledError
        raise AssertionError("The held run should have been stopped.")

    monkeypatch.setattr("agent_ui_creator.server._domain_write_agent_result", held_run)

    async def exercise():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                     base_url="http://testserver",
                                     headers={"Authorization": "Bearer " + "x" * 32}) as client:
            run = asyncio.create_task(client.post("/creator", json={
                "threadId": "thread-a", "runId": "active-run",
                "messages": [{"role": "user", "content": "请开发一个独立任务清单插件"}],
            }))
            await asyncio.wait_for(entered.wait(), timeout=5)
            stop = await client.post("/creator-control", json={
                "action": "stop", "threadId": "thread-a", "runId": "active-run",
            })
            assert stop.status_code == 202
            assert stop.json()["status"] == "stopping"
            assert (await client.post("/creator-control", json={
                "action": "stop", "threadId": "thread-a", "runId": "active-run",
            })).json()["status"] == "stopping"
            release.set()
            response = await run
            events = [json.loads(line.removeprefix("data: ")) for line in response.text.splitlines()
                      if line.startswith("data: ")]
            assert any(event.get("code") == "CREATOR_RUN_STOPPED" for event in events)

    asyncio.run(exercise())


def test_stop_after_source_commit_reports_retained_file_and_blocks_next_commit(tmp_path, monkeypatch):
    model = TrackingModel(responses=[AIMessage(content="unused")])
    app, _client = _app(tmp_path, monkeypatch, model)
    committed = asyncio.Event()
    release = asyncio.Event()

    async def held_run(settings, _messages, activity, coordinator, _diagnostics,
                       _thread_id, event_sink, _telemetry, **_kwargs):
        source = UISourceCreationService(
            project_root=settings.project_root, activity=activity,
            mutation_coordinator=coordinator,
            path_policy=MinimalAgentPathPolicy.internal_source(),
        )
        await source.create([UISourceFile(path="/plugins/task-list/manifest.json", content='{"id":"task-list"}\n')])
        committed.set()
        await release.wait()
        assert event_sink.cancel_requested
        with pytest.raises(asyncio.CancelledError):
            await source.create([UISourceFile(path="/plugins/task-list/late.ts", content="export {};\n")])
        raise asyncio.CancelledError

    monkeypatch.setattr("agent_ui_creator.server._domain_write_agent_result", held_run)

    async def exercise():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                     base_url="http://testserver",
                                     headers={"Authorization": "Bearer " + "x" * 32}) as client:
            run = asyncio.create_task(client.post("/creator", json={
                "threadId": "thread-a", "runId": "committed-run",
                "messages": [{"role": "user", "content": "请开发任务清单插件"}],
            }))
            await asyncio.wait_for(committed.wait(), timeout=5)
            stop = await client.post("/creator-control", json={
                "action": "stop", "threadId": "thread-a", "runId": "committed-run",
            })
            assert stop.status_code == 202
            assert stop.json()["status"] == "stopping"
            release.set()
            response = await run
            events = [json.loads(line.removeprefix("data: ")) for line in response.text.splitlines()
                      if line.startswith("data: ")]
            terminal = next(event for event in events if event.get("code") == "CREATOR_RUN_STOPPED")
            assert "plugins/task-list/manifest.json" in terminal["message"]
            assert (tmp_path / "plugins/task-list/manifest.json").is_file()
            assert not (tmp_path / "plugins/task-list/late.ts").exists()

    asyncio.run(exercise())


def test_stop_before_atomic_plugin_source_commit_leaves_no_target_files(tmp_path, monkeypatch):
    model = TrackingModel(responses=[AIMessage(content="unused")])
    app, _client = _app(tmp_path, monkeypatch, model)
    before_commit = asyncio.Event()
    release = asyncio.Event()

    async def held_run(settings, _messages, activity, coordinator, _diagnostics,
                       _thread_id, _event_sink, _telemetry, **_kwargs):
        source = UISourceCreationService(
            project_root=settings.project_root, activity=activity,
            mutation_coordinator=coordinator,
            path_policy=MinimalAgentPathPolicy.internal_source(),
        )
        async def preflight():
            before_commit.set()
            await release.wait()
        await source.create([
            UISourceFile(path="/plugins/task-list/manifest.json", content='{"id":"task-list"}\n'),
            UISourceFile(path="/plugins/task-list/definition.ts", content="export default {};\n"),
            UISourceFile(path="/plugins/task-list/index.tsx", content="export const App = () => null;\n"),
        ], require_absent_directory="/plugins/task-list", preflight=preflight)
        raise AssertionError("Cancel must prevent the whole source commit")

    monkeypatch.setattr("agent_ui_creator.server._domain_write_agent_result", held_run)

    async def exercise():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                     base_url="http://testserver",
                                     headers={"Authorization": "Bearer " + "x" * 32}) as client:
            run = asyncio.create_task(client.post("/creator", json={
                "threadId": "thread-a", "runId": "before-commit",
                "messages": [{"role": "user", "content": "请开发独立任务清单插件"}],
            }))
            await asyncio.wait_for(before_commit.wait(), timeout=5)
            assert (await client.post("/creator-control", json={
                "action": "stop", "threadId": "thread-a", "runId": "before-commit",
            })).status_code == 202
            release.set()
            response = await run
            events = [json.loads(line.removeprefix("data: ")) for line in response.text.splitlines()
                      if line.startswith("data: ")]
            assert any(event.get("code") == "CREATOR_RUN_STOPPED" for event in events)
            assert not any(event.get("name") == "on_interrupt" for event in events)
            assert not (tmp_path / "plugins/task-list").exists()
            assert (await client.post("/creator-control", json={
                "action": "stop", "threadId": "thread-a", "runId": "before-commit",
            })).json()["status"] == "stopped"

    asyncio.run(exercise())


def test_cancelled_run_transaction_undo_is_explicit_idempotent_and_conflict_safe(tmp_path, monkeypatch):
    model = TrackingModel(responses=[AIMessage(content="unused")])
    app, _client = _app(tmp_path, monkeypatch, model)
    committed = asyncio.Event()
    release = asyncio.Event()

    async def held_run(settings, messages, activity, coordinator, _diagnostics,
                       _thread_id, event_sink, _telemetry, **_kwargs):
        source = UISourceCreationService(
            project_root=settings.project_root, activity=activity,
            mutation_coordinator=coordinator,
            path_policy=MinimalAgentPathPolicy.internal_source(),
        )
        if "新任务" in str(messages):
            await source.create([UISourceFile(path="/plugins/new-task/manifest.json", content='{"id":"new-task"}\n')])
            empty_metrics = SimpleNamespace(to_dict=lambda: {})
            return SimpleNamespace(
                text="新任务已写入", completion="committed_unverified",
                metrics=empty_metrics, project_control=empty_metrics,
                repeated_project_control_reads=0, domain_observations=empty_metrics,
            )
        await source.create([
            UISourceFile(path="/plugins/task-list/manifest.json", content='{"id":"task-list"}\n'),
            UISourceFile(path="/plugins/task-list/definition.ts", content="export default {};\n"),
            UISourceFile(path="/plugins/task-list/index.tsx", content="export const App = () => null;\n"),
        ], require_absent_directory="/plugins/task-list")
        committed.set()
        await release.wait()
        assert event_sink.cancel_requested
        raise asyncio.CancelledError

    monkeypatch.setattr("agent_ui_creator.server._domain_write_agent_result", held_run)

    async def request(client, run_id, message):
        response = await client.post("/creator", json={
            "threadId": "thread-a", "runId": run_id,
            "messages": [{"role": "user", "content": message}],
        })
        return [json.loads(line.removeprefix("data: ")) for line in response.text.splitlines()
                if line.startswith("data: ")]

    async def exercise():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                     base_url="http://testserver",
                                     headers={"Authorization": "Bearer " + "x" * 32}) as client:
            run = asyncio.create_task(request(client, "cancel-undo", "请开发独立任务清单插件"))
            await asyncio.wait_for(committed.wait(), timeout=5)
            assert (await client.post("/creator-control", json={
                "action": "undo", "threadId": "thread-a", "runId": "cancel-undo",
            })).status_code == 409
            await client.post("/creator-control", json={
                "action": "stop", "threadId": "thread-a", "runId": "cancel-undo",
            })
            release.set()
            events = await run
            terminal = next(event for event in events if event.get("code") == "CREATOR_RUN_STOPPED")
            for path in ("manifest.json", "definition.ts", "index.tsx"):
                assert path in terminal["message"]
            assert not any(event.get("name") == "on_interrupt" for event in events)
            target = tmp_path / "plugins/task-list/manifest.json"
            assert target.is_file()
            original_after = target.read_text(encoding="utf-8")
            target.write_text("another task changed this file", encoding="utf-8")
            conflict_before_undo = await client.post("/creator-control", json={
                "action": "undo", "threadId": "thread-a", "runId": "cancel-undo",
            })
            assert conflict_before_undo.status_code == 409
            assert conflict_before_undo.json()["code"] == "CREATOR_UNDO_CONFLICT"
            assert target.read_text() == "another task changed this file"
            target.write_text(original_after, encoding="utf-8")
            undo = await client.post("/creator-control", json={
                "action": "undo", "threadId": "thread-a", "runId": "cancel-undo",
            })
            assert undo.status_code == 200
            assert undo.json()["status"] == "undone"
            assert not target.exists()
            repeated = await client.post("/creator-control", json={
                "action": "undo", "threadId": "thread-a", "runId": "cancel-undo",
            })
            assert repeated.status_code == 200 and repeated.json() == undo.json()
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("another task changed this file", encoding="utf-8")
            conflict = await client.post("/creator-control", json={
                "action": "undo", "threadId": "thread-a", "runId": "cancel-undo",
            })
            assert conflict.status_code == 409
            assert conflict.json()["code"] == "CREATOR_UNDO_CONFLICT"
            assert target.read_text() == "another task changed this file"
            fresh = await request(client, "new-task", "新任务：请开发独立插件")
            assert not any(event.get("code") == "CREATOR_RUN_STOPPED" for event in fresh)
            assert (tmp_path / "plugins/new-task/manifest.json").is_file()

    asyncio.run(exercise())


def test_headless_request_without_decision_answer_cannot_continue_or_grant(tmp_path, monkeypatch):
    model = TrackingModel(responses=[AIMessage(content="", tool_calls=[{
        "name": "prepare_ui_plugin_development", "args": PREPARE, "id": "prepare-headless",
    }])])
    app, client = _app(tmp_path, monkeypatch, model)

    first = _events(client, run_id="request-a", text="在聊天旁边做一个任务核对清单")
    assert any(event.get("name") == "on_interrupt" for event in first)
    attempted_continue = _events(client, run_id="request-b", text="继续")

    assert any(event.get("code") == "CREATOR_INTERRUPT_PENDING"
               for event in attempted_continue)
    assert app.state.plugin_development_authorities["thread-a"].active.status == "pending"
    assert not (tmp_path / "plugins").exists()


def test_approved_resume_loads_skill_before_create_becomes_visible(tmp_path, monkeypatch):
    model = TrackingModel(responses=[
        AIMessage(content="", tool_calls=[{
            "name": "prepare_ui_plugin_development", "args": PREPARE, "id": "prepare-c",
        }]),
        AIMessage(content="", tool_calls=[{
            "name": "read_file",
            "args": {"file_path": "/skills/ui-plugin-development/SKILL.md"},
            "id": "read-skill",
        }]),
        AIMessage(content="[creator-verification:read-only]方案已获批准，尚未实施。"),
    ])
    app, client = _app(tmp_path, monkeypatch, model)
    first = _events(client, run_id="request-a", text="在聊天旁边做一个任务核对清单")
    question = next(event["value"] for event in first if event.get("name") == "on_interrupt")
    resumed = _events(client, run_id="request-b", resume={
        "interruptId": question["id"],
        "answers": {"plugin-development-decision": ["start"]},
    })
    state = app.state.plugin_development_authorities["thread-a"]
    assert state.active.status == "authorized"
    assert state.active.grant_source == "proposal-approval"
    assert "create_ui_plugin" not in model.offered_tools[0]
    assert "create_ui_plugin" not in model.offered_tools[1]
    assert "create_ui_plugin" in model.offered_tools[2]
    assert not any(event["type"] == "RUN_ERROR" for event in resumed)


def test_concurrent_approval_resume_applies_only_once(tmp_path, monkeypatch):
    model = TrackingModel(responses=[
        AIMessage(content="", tool_calls=[{
            "name": "prepare_ui_plugin_development", "args": PREPARE, "id": "prepare-concurrent",
        }]),
        AIMessage(content="已收到一次开发批准，尚未实施。"),
    ])
    app, _client = _app(tmp_path, monkeypatch, model)

    async def run_requests():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver",
            headers={"Authorization": "Bearer " + "x" * 32},
        ) as client:
            async def post(run_id, *, text=None, resume=None):
                response = await client.post("/creator", json={
                    "threadId": "thread-a", "runId": run_id,
                    "messages": [{"role": "user", "content": text}] if text else [],
                    **({"forwardedProps": {"command": {"resume": resume}}} if resume else {}),
                })
                assert response.status_code == 200
                return [json.loads(line.removeprefix("data: "))
                        for line in response.text.splitlines() if line.startswith("data: ")]

            first = await post("request-a", text="在聊天旁边做一个任务核对清单")
            question = next(event["value"] for event in first if event.get("name") == "on_interrupt")
            resume = {
                "interruptId": question["id"],
                "answers": {"plugin-development-decision": ["start"]},
            }
            return await asyncio.gather(
                post("request-b", resume=resume), post("request-c", resume=resume),
            )

    responses = asyncio.run(run_requests())

    assert sum(any(event["type"] == "RUN_FINISHED" for event in response)
               for response in responses) == 1
    assert sum(any(event.get("code") == "CREATOR_INTERRUPT_NOT_FOUND"
                   for event in response) for response in responses) == 1
    assert app.state.plugin_development_authorities["thread-a"].active.status == "authorized"
    assert not (tmp_path / "plugins").exists()


def test_approved_resume_can_create_bound_plugin_after_skill_and_validation(tmp_path, monkeypatch):
    async def successful_command(_self, _command):
        return CommandExecutionResult("", 0, False)

    monkeypatch.setattr(
        "agent_ui_creator.validation.command_runner.CreatorValidationCommandRunner.execute_known_command",
        successful_command,
    )
    model = TrackingModel(responses=[
        AIMessage(content="", tool_calls=[{
            "name": "prepare_ui_plugin_development", "args": PREPARE, "id": "prepare-create",
        }]),
        AIMessage(content="", tool_calls=[{
            "name": "read_file",
            "args": {"file_path": "/skills/ui-plugin-development/SKILL.md"},
            "id": "read-current-skill",
        }]),
        AIMessage(content="", tool_calls=[{
            "name": "create_ui_plugin", "args": {
                "pluginId": "task-list", "files": [
                    {"relativePath": "manifest.json", "content": '{"id":"task-list"}'},
                    {"relativePath": "definition.ts", "content": "export {};"},
                    {"relativePath": "index.tsx", "content": "export {};"},
                ],
            }, "id": "create-bound-plugin",
        }]),
        AIMessage(content="", tool_calls=[{
            "name": "validate_creator_changes", "args": {}, "id": "validate-bound-plugin",
        }]),
        AIMessage(content="任务清单插件源码已创建并完成当前 revision 静态验证，但尚未挂载，交付未完成。"),
    ])
    app, client = _app(tmp_path, monkeypatch, model)
    first = _events(client, run_id="request-a", text="在聊天旁边做一个任务核对清单")
    question = next(event["value"] for event in first if event.get("name") == "on_interrupt")
    resumed = _events(client, run_id="request-b", resume={
        "interruptId": question["id"],
        "answers": {"plugin-development-decision": ["start"]},
    })
    assert not any(event["type"] == "RUN_ERROR" for event in resumed)
    assert (tmp_path / "plugins/task-list/manifest.json").exists()
    assert app.state.plugin_development_authorities["thread-a"].active.created_plugin_id == "task-list"
    finished = next(event for event in resumed if event["type"] == "RUN_FINISHED")
    assert finished["result"]["receipt"]["pluginDeliveries"][0]["delivery"]["status"] == "blocked"
    assert finished["result"]["staticValidationStatus"] == "passed"
    assert finished["result"]["runtimeVerificationStatus"] == "not-run"
    assert "create_ui_plugin" not in model.offered_tools[1]
    assert "create_ui_plugin" in model.offered_tools[2]


def test_direct_development_commission_does_not_ask_again(tmp_path, monkeypatch):
    model = TrackingModel(responses=[
        AIMessage(content="", tool_calls=[{
            "name": "prepare_ui_plugin_development", "args": PREPARE, "id": "direct-prepare",
        }]),
        AIMessage(content="[creator-verification:read-only]方案已建立，尚未实施。"),
    ])
    app, client = _app(tmp_path, monkeypatch, model, intent="explicit")
    events = _events(client, run_id="direct-a", text="请开发一个独立任务清单插件")
    assert not any(event.get("name") == "on_interrupt" for event in events)
    assert not any(event["type"] == "RUN_ERROR" for event in events)
    assert app.state.plugin_development_authorities["thread-a"].active.grant_source == "explicit-request"


def test_server_tool_admission_rejects_other_plugin_composition_before_write(tmp_path, monkeypatch):
    model_path = tmp_path / "app-ui" / "app-ui.json"
    model_path.parent.mkdir()
    model_path.write_text('{"root":{"type":"slot","plugins":[]}}\n', encoding="utf-8")
    before = model_path.read_bytes()
    observed = {}

    async def call_tool_on_server(_settings, _messages, _activity, _coordinator,
                                  _diagnostics, _thread_id, _event_sink, _telemetry,
                                  *, development_authority, **_kwargs):
        development_authority.begin_task(
            task_id="scope-a", request_id="scope-a",
            user_message="请开发一个独立任务清单插件", intent="explicit",
        )
        development_authority.prepare(**{
            "work_kind": "create-plugin", "target_plugin_id": "task-list",
            "desired_outcome": "本地任务清单", "missing_capabilities": ["清单交互"],
            "reuse_evidence_refs": [],
        })
        development_authority.mark_skill_loaded()
        middleware = PluginDevelopmentAdmissionMiddleware(development_authority)

        def forbidden_host_write(_request):
            model_path.write_text("unauthorized", encoding="utf-8")
            return "allowed"

        response = middleware.wrap_tool_call(SimpleNamespace(tool_call={
            "name": "mutate_app_ui_model", "id": "insert-other",
            "args": {"operations": [{"type": "insert_plugin",
                    "plugin": {"id": "other-main", "pluginId": "other", "enabled": True},
                    "target": {"type": "application"}}]},
        }), forbidden_host_write)
        observed["result"] = json.loads(response.content)
        metrics = SimpleNamespace(to_dict=lambda: {})
        return SimpleNamespace(text="授权拒绝已由实际工具中间件返回。", completion="success",
                               metrics=metrics, project_control=metrics,
                               repeated_project_control_reads=0,
                               domain_observations=metrics)

    monkeypatch.setattr("agent_ui_creator.server._domain_write_agent_result", call_tool_on_server)
    _app_instance, client = _app(tmp_path, monkeypatch,
                                 TrackingModel(responses=[AIMessage(content="unused")]),
                                 intent="explicit")
    events = _events(client, run_id="scope-a", text="请开发一个独立任务清单插件")
    assert any(event["type"] == "RUN_FINISHED" for event in events)
    assert observed["result"]["ok"] is False
    assert observed["result"]["error"]["code"] == "PLUGIN_DEVELOPMENT_AUTHORIZATION_REQUIRED"
    assert observed["result"]["error"]["stateChanged"] is False
    assert model_path.read_bytes() == before


def test_server_tool_admission_rejects_new_platform_panel_in_navigation_slot(tmp_path, monkeypatch):
    model_path = tmp_path / "app-ui/app-ui.json"
    model_path.parent.mkdir()
    model_path.write_text(json.dumps({"root": {
        "type": "row", "children": [
            {"type": "panel", "child": {"type": "slot", "plugins": [
                {"id": "nav-main", "pluginId": "conversation-thread-list", "enabled": True},
            ]}},
            {"type": "panel", "child": {"type": "slot", "plugins": [
                {"id": "conversation-main", "pluginId": "conversation-surface", "enabled": True},
            ]}},
        ], "responsive": {"type": "trailing-drawer", "primaryIndex": 1,
                          "drawerIndex": 2, "minPrimaryWidth": 320},
    }}), encoding="utf-8")
    before = model_path.read_bytes()
    observed = {}

    async def call_tool_on_server(_settings, _messages, _activity, _coordinator,
                                  _diagnostics, _thread_id, _event_sink, _telemetry,
                                  *, development_authority, **_kwargs):
        development_authority.begin_task(
            task_id="panel-a", request_id="panel-a",
            user_message="请开发一个会话旁任务清单面板插件", intent="explicit",
        )
        development_authority.prepare(**{
            "work_kind": "create-plugin", "target_plugin_id": "task-list",
            "desired_outcome": "会话旁任务清单面板", "missing_capabilities": ["清单交互"],
            "reuse_evidence_refs": [], "delivery_contract": {
                "capability": "任务清单", "renderingCategory": "panel",
                "placement": "会话旁", "lifecycle": "页面内存",
                "dependencies": [], "verificationMethod": "runtime",
            },
        })
        development_authority.mark_skill_loaded()
        middleware = PluginDevelopmentAdmissionMiddleware(development_authority)

        def forbidden_host_write(_request):
            model_path.write_text("wrong placement", encoding="utf-8")
            return "allowed"

        response = middleware.wrap_tool_call(SimpleNamespace(tool_call={
            "name": "mutate_app_ui_model", "id": "insert-in-nav",
            "args": {"operations": [{"type": "insert_plugin",
                    "plugin": {"id": "task-list-main", "pluginId": "task-list", "enabled": True},
                    "target": {"type": "layout_slot", "slotRef": "l2"}}]},
        }), forbidden_host_write)
        observed["result"] = json.loads(response.content)
        metrics = SimpleNamespace(to_dict=lambda: {})
        return SimpleNamespace(text="已拦截错误区域。", completion="success",
                               metrics=metrics, project_control=metrics,
                               repeated_project_control_reads=0,
                               domain_observations=metrics)

    monkeypatch.setattr("agent_ui_creator.server._domain_write_agent_result", call_tool_on_server)
    _app_instance, client = _app(tmp_path, monkeypatch,
                                 TrackingModel(responses=[AIMessage(content="unused")]),
                                 intent="explicit")
    events = _events(client, run_id="panel-a", text="请开发一个会话旁任务清单面板插件")
    assert any(event["type"] == "RUN_FINISHED" for event in events)
    assert observed["result"]["error"]["code"] == "PLUGIN_DEVELOPMENT_PLACEMENT_REQUIRED"
    assert observed["result"]["error"]["stateChanged"] is False
    assert model_path.read_bytes() == before


def test_server_tool_admission_requires_declared_relative_plugin_placement(tmp_path, monkeypatch):
    model_path = tmp_path / "app-ui" / "app-ui.json"
    model_path.parent.mkdir()
    model_path.write_text(json.dumps({"root": {
        "type": "row", "children": [
            {"type": "panel", "child": {"type": "slot", "plugins": [
                {"id": "nav-main", "pluginId": "conversation-thread-list", "enabled": True},
            ]}},
            {"type": "panel", "child": {"type": "slot", "plugins": [
                {"id": "conversation-main", "pluginId": "conversation-surface", "enabled": True},
            ]}},
        ], "responsive": {"type": "trailing-drawer", "primaryIndex": 1,
                          "drawerIndex": 2, "minPrimaryWidth": 320},
    }}), encoding="utf-8")
    before = model_path.read_bytes()
    observed = {}

    async def call_tool_on_server(_settings, _messages, _activity, _coordinator,
                                  _diagnostics, _thread_id, _event_sink, _telemetry,
                                  *, development_authority, **_kwargs):
        development_authority.begin_task(
            task_id="placement-a", request_id="placement-a",
            user_message="请开发一个会话右侧任务清单插件", intent="explicit",
        )
        development_authority.prepare(**{
            "work_kind": "create-plugin", "target_plugin_id": "task-list",
            "desired_outcome": "会话右侧任务清单", "missing_capabilities": ["清单交互"],
            "reuse_evidence_refs": [],
        })
        development_authority.mark_skill_loaded()
        manifest_path = tmp_path / "plugins" / "task-list" / "manifest.json"
        manifest_path.parent.mkdir(parents=True)
        manifest_path.write_text(json.dumps({
            "id": "task-list",
            "authoring": {"defaultPlacement": {
                "type": "relative", "relation": "after", "anchorPluginId": "conversation-surface",
            }},
        }), encoding="utf-8")
        development_authority.mark_created("task-list")
        middleware = PluginDevelopmentAdmissionMiddleware(development_authority)

        def forbidden_host_write(_request):
            model_path.write_text("wrong placement", encoding="utf-8")
            return "allowed"

        response = middleware.wrap_tool_call(SimpleNamespace(tool_call={
            "name": "mutate_app_ui_model", "id": "insert-in-conversation-slot",
            "args": {"operations": [{"type": "insert_plugin",
                    "plugin": {"id": "task-list-main", "pluginId": "task-list", "enabled": True},
                    "target": {"type": "layout_slot", "slotRef": "l4"}, "index": 1}]},
        }), forbidden_host_write)
        observed["result"] = json.loads(response.content)
        nested = middleware.wrap_tool_call(SimpleNamespace(tool_call={
            "name": "mutate_app_ui_model", "id": "insert-nested-row",
            "args": {"operations": [{"type": "insert_layout_relative", "anchorRef": "l4",
                    "direction": "right", "node": {"type": "panel", "child": {
                        "type": "slot", "plugins": [{"id": "task-list-main",
                            "pluginId": "task-list", "enabled": True}],
                    }}}]},
        }), forbidden_host_write)
        observed["nested"] = json.loads(nested.content)
        observed["rootPanel"] = middleware.wrap_tool_call(SimpleNamespace(tool_call={
            "name": "mutate_app_ui_model", "id": "insert-root-drawer-panel",
            "args": {"operations": [{"type": "insert_layout_node", "parentRef": "l0",
                    "index": 2, "size": "280px", "node": {"type": "panel", "child": {
                        "type": "slot", "plugins": [{"id": "task-list-main",
                            "pluginId": "task-list", "enabled": True}],
                    }}}]},
        }), lambda _request: "admitted")
        observed["default"] = middleware.wrap_tool_call(SimpleNamespace(tool_call={
            "name": "mutate_app_ui_model", "id": "insert-at-default",
            "args": {"operations": [{"type": "insert_plugin_default",
                    "plugin": {"id": "task-list-main", "pluginId": "task-list", "enabled": True}}]},
        }), lambda _request: "admitted")
        metrics = SimpleNamespace(to_dict=lambda: {})
        return SimpleNamespace(text="布局授权检查完成。", completion="success",
                               metrics=metrics, project_control=metrics,
                               repeated_project_control_reads=0,
                               domain_observations=metrics)

    monkeypatch.setattr("agent_ui_creator.server._domain_write_agent_result", call_tool_on_server)
    _app_instance, client = _app(tmp_path, monkeypatch,
                                 TrackingModel(responses=[AIMessage(content="unused")]),
                                 intent="explicit")
    events = _events(client, run_id="placement-a", text="请开发一个会话右侧任务清单插件")
    assert any(event["type"] == "RUN_FINISHED" for event in events), events
    assert observed["result"]["ok"] is False
    assert observed["result"]["error"]["code"] == "PLUGIN_DEVELOPMENT_PLACEMENT_REQUIRED", observed["result"]
    assert "insert_plugin_default" in observed["result"]["error"]["message"]
    assert observed["result"]["error"]["stateChanged"] is False
    assert observed["nested"]["error"]["code"] == "PLUGIN_DEVELOPMENT_PLACEMENT_REQUIRED"
    assert observed["nested"]["error"]["stateChanged"] is False
    assert observed["rootPanel"] == "admitted"
    assert observed["default"] == "admitted"
    assert model_path.read_bytes() == before


def test_ordinary_question_preserves_existing_development_scope(tmp_path, monkeypatch):
    model = TrackingModel(responses=[
        AIMessage(content="", tool_calls=[{
            "name": "prepare_ui_plugin_development", "args": PREPARE, "id": "direct-prepare",
        }]),
        AIMessage(content="", tool_calls=[{
            "name": "ask_user_question", "args": ORDINARY_QUESTION, "id": "ordinary-q",
        }]),
        AIMessage(content="", tool_calls=[{
            "name": "read_file",
            "args": {"file_path": "/skills/ui-plugin-development/SKILL.md"},
            "id": "read-skill-after-ordinary",
        }]),
        AIMessage(content="[creator-verification:read-only]信息已明确，尚未实施。"),
    ])
    app, client = _app(tmp_path, monkeypatch, model, intent="explicit")
    first = _events(client, run_id="direct-a", text="请开发一个独立任务清单插件")
    question = next(event["value"] for event in first if event.get("name") == "on_interrupt")
    assert question["metadata"]["steps"][0]["id"] == "ordinary"
    state = app.state.plugin_development_authorities["thread-a"]
    original_scope = state.active.scope_hash
    resumed = _events(client, run_id="direct-b", resume={
        "interruptId": question["id"], "answers": {"ordinary": ["short"]},
    })
    assert not any(event["type"] == "RUN_ERROR" for event in resumed)
    assert state.active.status == "authorized"
    assert state.active.scope_hash == original_scope
    assert "create_ui_plugin" in model.offered_tools[-1]


def test_sidecar_restart_does_not_resume_or_authorize_pending_plan(tmp_path, monkeypatch):
    model = TrackingModel(responses=[AIMessage(content="", tool_calls=[{
        "name": "prepare_ui_plugin_development", "args": PREPARE, "id": "prepare-before-restart",
    }])])
    _old_app, old_client = _app(tmp_path, monkeypatch, model)
    first = _events(old_client, run_id="request-a", text="在聊天旁边做一个任务核对清单")
    question = next(event["value"] for event in first if event.get("name") == "on_interrupt")
    new_app, new_client = _app(tmp_path, monkeypatch, TrackingModel(responses=[]))
    resumed = _events(new_client, run_id="request-b", resume={
        "interruptId": question["id"],
        "answers": {"plugin-development-decision": ["start"]},
    })
    assert any(event.get("code") == "CREATOR_INTERRUPT_NOT_FOUND" for event in resumed)
    assert new_app.state.plugin_development_authorities["thread-a"].active is None
    assert not (tmp_path / "plugins").exists()


def test_failed_run_reports_persisted_changes_without_claiming_validation(tmp_path, monkeypatch):
    async def fail_after_write(activity):
        path = "/plugins/generated-file-message/index.tsx"
        activity.capture_before(path)
        target = tmp_path / path.lstrip("/")
        target.parent.mkdir(parents=True)
        target.write_text("export {};", encoding="utf-8")
        activity.touch(path)
        raise RuntimeError("model transport unavailable")

    monkeypatch.setattr(
        "agent_ui_creator.server._general_domain_write_agent_result",
        lambda _settings, _messages, activity, *_args, **_kwargs: fail_after_write(activity),
    )
    _app_instance, client = _app(
        tmp_path, monkeypatch, TrackingModel(responses=[]), intent="none",
    )

    events = _events(client, run_id="failed-after-install", text="显示文件结果")

    error = next(event for event in events if event["type"] == "RUN_ERROR")
    assert "未验证" in error["message"]
    assert "plugins/generated-file-message/index.tsx" in error["message"]
    assert "export {};" not in error["message"]
    assert (tmp_path / "plugins/generated-file-message/index.tsx").exists()
