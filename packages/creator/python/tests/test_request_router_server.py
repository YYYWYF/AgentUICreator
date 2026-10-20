"""Exercise the default router with the actual read agent and permission guard."""
import asyncio

import pytest
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage

from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.app_ui_model import ProjectMutationCoordinator
from agent_ui_creator.config import CreatorServerSettings
from agent_ui_creator.domain_agent.tool_policy import SIDE_EFFECT_TOOL_NAMES
from agent_ui_creator.model_protocol.errors import ToolPermissionDeniedError
from agent_ui_creator.observability import CreatorRunTelemetry
from agent_ui_creator.runtime_diagnostics import RuntimeDiagnosticStore
from agent_ui_creator.server import _domain_write_agent_result


class RoutedModel(FakeMessagesListChatModel):
    def model_copy(self, **_kwargs):
        # One scripted response cursor across routing and the execution agent.
        return self

    def bind_tools(self, tools, **_kwargs):
        object.__setattr__(self, "offered", {tool.name for tool in tools})
        return self


@pytest.mark.parametrize("route", ["READ_ONLY ANSWER", "READ_ONLY_EXPLICIT INSPECT"])
@pytest.mark.parametrize("forbidden_edit", [False, True])
def test_default_router_preserves_actual_read_permissions(tmp_path, monkeypatch, route, forbidden_edit):
    (tmp_path / ".agent-ui").mkdir()
    (tmp_path / ".agent-ui/project.json").write_text(
        '{"mode":"platform","sourceRoot":"src"}', encoding="utf-8",
    )
    target = tmp_path / "src/plugins/sample.ts"
    target.parent.mkdir(parents=True)
    target.write_text('export const label = "original";\n', encoding="utf-8")
    responses = [AIMessage(content=route)]
    if forbidden_edit:
        responses.append(AIMessage(content="", tool_calls=[{
            "name": "edit_file", "id": "forbidden", "args": {
                "file_path": "/src/plugins/sample.ts",
                "old_string": "original", "new_string": "changed",
            },
        }]))
    elif route.endswith("INSPECT"):
        responses.append(AIMessage(content="", tool_calls=[{
            "name": "read_file", "id": "read", "args": {"file_path": "/src/plugins/sample.ts"},
        }]))
    responses.append(AIMessage(content="已检查。"))
    model = RoutedModel(responses=responses)
    object.__setattr__(model, "offered", set())
    monkeypatch.setenv("CREATOR_MODEL_BASE_URL", "http://127.0.0.1:9/v1")
    monkeypatch.setenv("CREATOR_MODEL_API_KEY", "test-only")
    monkeypatch.setattr("agent_ui_creator.model_factory.create_creator_chat_model", lambda *_a, **_k: model)
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("request-router-read")
    telemetry = CreatorRunTelemetry()
    settings = CreatorServerSettings(project_root=tmp_path, skills_root=tmp_path, auth_token="x" * 32)
    request = _domain_write_agent_result(
        settings, [{"role": "user", "content": "先检查，不要修改"}], activity,
        ProjectMutationCoordinator(), RuntimeDiagnosticStore(), "thread-read", None, telemetry,
    )
    if forbidden_edit:
        with pytest.raises(ToolPermissionDeniedError):
            asyncio.run(request)
    else:
        result = asyncio.run(request)
        assert result.text == "已检查。"
    assert not SIDE_EFFECT_TOOL_NAMES.intersection(model.offered)
    if route.endswith("ANSWER"):
        assert model.offered == set()
    assert target.read_text(encoding="utf-8") == 'export const label = "original";\n'
    assert activity.revision == 0
    assert telemetry.action_selector["actionSelectorCandidateCount"] == 0


@pytest.mark.parametrize('explicit,upgrade,repeat_review', [
    (False,False,False), (True,False,False), (True,True,False), (True,False,True),
])
@pytest.mark.parametrize('truncated',[False,True])
def test_route_review_preserves_original_transcript_and_permission(tmp_path,monkeypatch,explicit,upgrade,repeat_review,truncated):
    import copy
    (tmp_path/'.agent-ui').mkdir()
    (tmp_path/'.agent-ui/project.json').write_text('{"mode":"platform","sourceRoot":"src"}')
    original = '请检查并给出计划，暂不修改' if explicit else '检查后帮我修改'
    route = 'READ_ONLY_EXPLICIT INSPECT' if explicit else 'READ_ONLY INSPECT'
    marker = 'ROUTE_REVIEW_REQUESTED\n报告仅为导航，不是授权。'
    model = RoutedModel(responses=[*([AIMessage(content='',response_metadata={'finish_reason':'length'})] if truncated else []),
        AIMessage(content=route),AIMessage(content=marker),
        AIMessage(content='MODIFY GENERAL' if upgrade else route),
        AIMessage(content=marker if repeat_review else '已完成只读计划。')])
    object.__setattr__(model,'offered',set())
    monkeypatch.setenv('CREATOR_MODEL_BASE_URL','http://127.0.0.1:9/v1')
    monkeypatch.setenv('CREATOR_MODEL_API_KEY','test-only')
    monkeypatch.setattr('agent_ui_creator.model_factory.create_creator_chat_model',lambda *_a,**_k:model)
    messages=[{'role':'user','content':original}]
    before=copy.deepcopy(messages)
    activity=CreatorActivityRecorder(tmp_path);activity.begin('review-input-isolation')
    telemetry=CreatorRunTelemetry()
    settings=CreatorServerSettings(project_root=tmp_path,skills_root=tmp_path,auth_token='x'*32)
    call=_domain_write_agent_result(settings,messages,activity,ProjectMutationCoordinator(),
        RuntimeDiagnosticStore(),'review-thread',None,telemetry)
    if upgrade or repeat_review:
        with pytest.raises(RuntimeError,match='只读权限|未给出最终答复'):
            asyncio.run(call)
    else:
        result=asyncio.run(call)
        assert result.text=='已完成只读计划。'
    assert messages==before
    assert all(isinstance(m,dict) for m in messages)
    assert not SIDE_EFFECT_TOOL_NAMES.intersection(model.offered)
    assert activity.revision==0
    assert telemetry.action_selector['actionSelectorCalls']==2+int(truncated)
    assert telemetry.action_selector['actionSelectorOutputBudgetRetries']==int(truncated)
