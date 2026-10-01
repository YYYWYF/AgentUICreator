from __future__ import annotations

import asyncio
import json
from pathlib import Path

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
from agent_ui_creator.validation.models import CommandExecutionResult


SKILLS_ROOT = Path(__file__).resolve().parents[2] / "creator" / "skills"
PREPARE = {
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

    resumed = _events(client, run_id="request-b", resume={
        "interruptId": question["id"],
        "answers": {"plugin-development-decision": [choice]},
    })
    assert not any(event["type"] == "RUN_ERROR" for event in resumed)
    finished = next(event for event in resumed if event["type"] == "RUN_FINISHED")
    assert finished["result"]["pluginDevelopment"]["status"] == choice
    assert state.active.status == choice
    assert not (tmp_path / "plugins").exists()
    assert expected in json.dumps(resumed, ensure_ascii=False)
    repeated = _events(client, run_id="request-c", resume={
        "interruptId": question["id"],
        "answers": {"plugin-development-decision": [choice]},
    })
    assert any(event.get("code") == "CREATOR_INTERRUPT_NOT_FOUND" for event in repeated)


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
        AIMessage(content="任务清单插件源码已创建并完成当前 revision 静态验证。"),
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
