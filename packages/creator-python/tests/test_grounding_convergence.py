import json
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from langchain.agents.middleware import ModelRequest, ModelResponse
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.domain_agent.grounding_convergence import (
    COMPOSITION_GROUNDING_CONTROL,
    COMPOSITION_POST_MUTATION_TOOL_NAMES,
    COMPOSITION_PRE_MUTATION_TOOL_NAMES,
    CompositionGroundingConvergenceMiddleware,
)
from agent_ui_creator.domain_agent.tool_policy import ALLOWED_DOMAIN_WRITE_TOOLS
from agent_ui_creator.domain_state import DomainObservationContext
from agent_ui_creator.minimal_agent.path_policy import (
    MinimalAgentPathPolicy,
    PolicyFilesystemBackend,
)
from agent_ui_creator.model_protocol.trace import ModelCallTrace, ToolProtocolMetrics
from agent_ui_creator.observability import CreatorRunLogger


COMPOSITION_COVERAGE = (
    "composition.model",
    "composition.layout",
    "composition.slots",
    "composition.instances",
    "capability.inventory",
    "capability.composition-summary",
)


def test_grounded_composition_injects_short_execution_control(tmp_path):
    backend = PolicyFilesystemBackend(tmp_path, MinimalAgentPathPolicy.development())
    observations = DomainObservationContext()
    middleware = CompositionGroundingConvergenceMiddleware(observations, backend)
    request = ModelRequest(
        model=Mock(),
        messages=[HumanMessage(content="添加会话管理")],
        tools=[SimpleNamespace(name="mutate_app_ui_model")],
    )
    seen = []

    def handler(candidate):
        seen.append(candidate.messages)
        return ModelResponse(result=[AIMessage(content="done")])

    middleware.wrap_model_call(request, handler)
    assert not any(
        isinstance(message, SystemMessage)
        and message.content == COMPOSITION_GROUNDING_CONTROL
        for message in seen[-1]
    )

    observations.observe_composition_snapshot(
        hash="a" * 64,
        revision=0,
        coverage=COMPOSITION_COVERAGE,
    )
    middleware.wrap_model_call(request, handler)
    assert sum(
        isinstance(message, SystemMessage)
        and message.content == COMPOSITION_GROUNDING_CONTROL
        for message in seen[-1]
    ) == 1

    backend.activity.touch("app-ui/app-ui.json")
    middleware.wrap_model_call(request, handler)
    assert not any(
        isinstance(message, SystemMessage)
        and message.content == COMPOSITION_GROUNDING_CONTROL
        for message in seen[-1]
    )


def test_grounded_composition_narrows_and_restores_tool_surface(tmp_path):
    backend = PolicyFilesystemBackend(tmp_path, MinimalAgentPathPolicy.development())
    observations = DomainObservationContext()
    all_tools = [
        SimpleNamespace(name=name)
        for name in ALLOWED_DOMAIN_WRITE_TOOLS
    ]
    request = ModelRequest(model=Mock(), messages=[], tools=all_tools)
    middleware = CompositionGroundingConvergenceMiddleware(observations, backend)
    seen = []

    def handler(candidate):
        seen.append(candidate)
        return ModelResponse(result=[AIMessage(content="done")])

    middleware.wrap_model_call(request, handler)
    assert [tool.name for tool in seen[-1].tools] == [tool.name for tool in all_tools]

    observations.observe_composition_snapshot(
        hash="a" * 64,
        revision=0,
        coverage=COMPOSITION_COVERAGE,
    )
    middleware.wrap_model_call(request, handler)
    pre_mutation_tool_names = [tool.name for tool in seen[-1].tools]
    assert pre_mutation_tool_names == list(COMPOSITION_PRE_MUTATION_TOOL_NAMES)
    assert "inspect_app_ui_model" not in pre_mutation_tool_names
    assert "list_ui_plugins" not in pre_mutation_tool_names
    assert "inspect_ui_slots" not in pre_mutation_tool_names
    assert "inspect_ui_plugin" not in pre_mutation_tool_names
    assert "inspect_ui_services" not in pre_mutation_tool_names

    def mutate_and_touch(candidate):
        backend.activity.touch("app-ui/app-ui.json")
        return ToolMessage(
            content='{"ok":true}',
            tool_call_id=candidate.tool_call["id"],
            name=candidate.tool_call["name"],
        )

    middleware.wrap_tool_call(
        _tool_request("mutate_app_ui_model", {"operations": []}),
        mutate_and_touch,
    )
    middleware.wrap_model_call(request, handler)
    assert [tool.name for tool in seen[-1].tools] == list(COMPOSITION_POST_MUTATION_TOOL_NAMES)

    backend.activity.touch("app-ui/app-ui.json")
    middleware.wrap_model_call(request, handler)
    assert [tool.name for tool in seen[-1].tools] == [tool.name for tool in all_tools]

    observations.observe_composition_snapshot(
        hash="b" * 64,
        revision=backend.mutation_revision,
        coverage=COMPOSITION_COVERAGE,
    )
    observations.clear_composition_grounding(
        reason="full_project_navigation",
        current_revision=backend.mutation_revision,
    )
    middleware.wrap_model_call(request, handler)
    assert [tool.name for tool in seen[-1].tools] == [tool.name for tool in all_tools]


def _tool_request(name, arguments, call_id="call-1"):
    return SimpleNamespace(
        tool_call={"name": name, "args": arguments, "id": call_id}
    )


def test_grounded_composition_blocks_source_read_but_allows_skill_read(tmp_path):
    backend = PolicyFilesystemBackend(tmp_path, MinimalAgentPathPolicy.development())
    observations = DomainObservationContext()
    observations.observe_composition_snapshot(
        hash="a" * 64,
        revision=0,
        coverage=COMPOSITION_COVERAGE,
    )
    middleware = CompositionGroundingConvergenceMiddleware(observations, backend)
    executed = []

    def handler(request):
        executed.append(request.tool_call)
        return ToolMessage(
            content="1: skill",
            tool_call_id=request.tool_call["id"],
            name=request.tool_call["name"],
            status="success",
        )

    prohibited = middleware.wrap_tool_call(
        _tool_request("read_file", {"file_path": "/plugins/foo/index.tsx"}),
        handler,
    )
    allowed = middleware.wrap_tool_call(
        _tool_request(
            "read_file",
            {"file_path": "/skills/app-ui-model/SKILL.md"},
            "call-2",
        ),
        handler,
    )

    assert json.loads(prohibited.content)["error"]["code"] == (
        "COMPOSITION_FAST_PATH_CROSS_LAYER_READ_PROHIBITED"
    )
    assert allowed.content == "1: skill"
    assert [call["id"] for call in executed] == ["call-2"]
    assert (
        observations.composition_fast_path_metrics.crossLayerReadAttemptsBeforeMutation
        == 1
    )
    assert observations.composition_grounding_status(current_revision=0) == (
        "unobserved"
    )
    assert observations.composition_fast_path_metrics.fastPathExits == 1


def test_stale_grounding_allows_source_read_and_counts_success(tmp_path):
    backend = PolicyFilesystemBackend(tmp_path, MinimalAgentPathPolicy.development())
    observations = DomainObservationContext()
    observations.observe_composition_snapshot(
        hash="a" * 64,
        revision=0,
        coverage=COMPOSITION_COVERAGE,
    )
    backend.activity.touch("app-ui/app-ui.json")
    middleware = CompositionGroundingConvergenceMiddleware(observations, backend)

    result = middleware.wrap_tool_call(
        _tool_request("read_file", {"file_path": "/services/conversations.ts"}),
        lambda request: ToolMessage(
            content="1: export interface ConversationService {}",
            tool_call_id=request.tool_call["id"],
            name=request.tool_call["name"],
            status="success",
        ),
    )

    assert result.status == "success"
    assert (
        observations.composition_fast_path_metrics.filesystemSourceReadsBeforeMutation
        == 1
    )


def test_first_mutation_metrics_reuse_protocol_traces(tmp_path):
    backend = PolicyFilesystemBackend(tmp_path, MinimalAgentPathPolicy.development())
    observations = DomainObservationContext()
    protocol = ToolProtocolMetrics(
        modelCalls=2,
        inputTokens=321,
        traces=[
            ModelCallTrace(
                sequence=1,
                durationMs=120,
                finishReason="tool_calls",
                contentBlockTypes=(),
                toolCallNames=("inspect_ui_project",),
                toolCallCount=1,
                invalidToolCallCount=0,
                hasReasoningContent=False,
                reasoningContentRetained=False,
                inputTokens=100,
                outputTokens=20,
            ),
            ModelCallTrace(
                sequence=2,
                durationMs=80,
                finishReason="tool_calls",
                contentBlockTypes=(),
                toolCallNames=("mutate_app_ui_model",),
                toolCallCount=1,
                invalidToolCallCount=0,
                hasReasoningContent=False,
                reasoningContentRetained=False,
                inputTokens=221,
                outputTokens=30,
            ),
        ],
    )
    middleware = CompositionGroundingConvergenceMiddleware(
        observations,
        backend,
        protocol_metrics=protocol,
    )

    middleware.wrap_tool_call(
        _tool_request("mutate_app_ui_model", {"operations": []}),
        lambda request: ToolMessage(
            content='{"ok":true,"result":{"changed":true}}',
            tool_call_id=request.tool_call["id"],
            name=request.tool_call["name"],
            status="success",
        ),
    )

    metrics = observations.composition_fast_path_metrics.to_dict()
    assert metrics["modelCallsBeforeFirstMutation"] == 2
    assert metrics["readRoundsBeforeFirstMutation"] == 1
    assert metrics["readToolsBeforeFirstMutation"] == 1
    assert metrics["inputTokensBeforeFirstMutation"] == 321
    assert metrics["modelLatencyBeforeFirstMutationMs"] == 200
    assert metrics["firstMutationSucceeded"] is True
    assert metrics["firstMutationErrorCode"] is None


def test_first_mutation_metrics_capture_host_error_code(tmp_path):
    backend = PolicyFilesystemBackend(tmp_path, MinimalAgentPathPolicy.development())
    observations = DomainObservationContext()
    protocol = ToolProtocolMetrics(modelCalls=1)
    middleware = CompositionGroundingConvergenceMiddleware(
        observations,
        backend,
        protocol_metrics=protocol,
    )

    middleware.wrap_tool_call(
        _tool_request("mutate_app_ui_model", {"operations": []}),
        lambda request: ToolMessage(
            content=(
                '{"ok":false,"error":{"code":"LAYOUT_SIZE_REQUIRED",'
                '"message":"size is required"}}'
            ),
            tool_call_id=request.tool_call["id"],
            name=request.tool_call["name"],
            status="success",
        ),
    )

    metrics = observations.composition_fast_path_metrics.to_dict()
    assert metrics["firstMutationSucceeded"] is False
    assert metrics["firstMutationErrorCode"] == "LAYOUT_SIZE_REQUIRED"


def test_grounding_middleware_emits_bounded_tool_trajectory(tmp_path):
    logger = CreatorRunLogger(tmp_path)
    logger.begin(run_id="trajectory-run")
    activity = CreatorActivityRecorder(tmp_path, logger=logger)
    activity.begin("trajectory-run")
    backend = PolicyFilesystemBackend(
        tmp_path,
        MinimalAgentPathPolicy.development(),
        activity=activity,
    )
    observations = DomainObservationContext()
    observations.observe_composition_snapshot(
        hash="a" * 64,
        revision=0,
        coverage=COMPOSITION_COVERAGE,
    )
    middleware = CompositionGroundingConvergenceMiddleware(
        observations,
        backend,
        protocol_metrics=ToolProtocolMetrics(modelCalls=2),
    )

    middleware.wrap_tool_call(
        _tool_request("inspect_ui_project", {"view": "composition"}),
        lambda request: ToolMessage(
            content='{"ok":true,"result":{"snapshot":"omitted"}}',
            tool_call_id=request.tool_call["id"],
            name=request.tool_call["name"],
            status="success",
        ),
    )
    middleware.wrap_tool_call(
        _tool_request("read_file", {"file_path": "/plugins/foo/index.ts"}, "call-2"),
        lambda request: pytest.fail("source read should be blocked"),
    )

    entries = [
        json.loads(line)
        for line in logger.path.read_text(encoding="utf-8").splitlines()
        if '"creator_tool_observation"' in line
    ]
    assert [entry["data"]["toolName"] for entry in entries] == [
        "inspect_ui_project",
        "read_file",
    ]
    assert entries[0]["data"]["phase"] == "before_first_mutation"
    assert entries[0]["data"]["result"]["factKinds"] == [
        "composition.snapshot",
        "capability.summary",
        "service.readiness",
    ]
    assert entries[1]["data"]["result"]["status"] == "rejected"
