import pytest
from langchain.agents.middleware import ModelRequest, ModelResponse
from langchain_core.messages import AIMessage
from langchain_core.tools import tool

from agent_ui_creator.model_protocol import (
    ModelToolProtocolError,
    ToolProtocolGuard,
    ToolProtocolMetrics,
    ToolProtocolMiddleware,
)


@tool
def read_file(file_path: str) -> str:
    """Read a fixture file."""
    return file_path


def inspect(message, *, require_tool=False):
    metrics = ToolProtocolMetrics()
    decision = ToolProtocolGuard(metrics).inspect(
        ModelResponse(result=[message]), [read_file], require_tool=require_tool
    )
    return decision, metrics


def test_valid_structured_tool_call_passes_through():
    message = AIMessage(
        content="",
        tool_calls=[
            {"name": "read_file", "args": {"file_path": "/src/a.ts"}, "id": "call-1"}
        ],
    )
    decision, metrics = inspect(message)

    assert decision.status == "tool_call"
    assert decision.response.result[0] is message
    assert metrics.validToolCalls == 1


def test_invalid_tool_call_requests_repair():
    message = AIMessage(
        content="",
        invalid_tool_calls=[
            {"name": "read_file", "args": "{", "id": "call-1", "error": "JSON"}
        ],
    )
    decision, metrics = inspect(message)

    assert decision.status == "repair"
    assert metrics.invalidToolCalls == 1
    assert metrics.toolArgumentParseFailures == 1


def test_high_confidence_pseudo_call_is_recovered():
    message = AIMessage(
        content=[
            {
                "type": "text",
                "name": "read_file",
                "args": {"file_path": "/src/a.ts"},
            }
        ]
    )
    decision, metrics = inspect(message)

    assert decision.status == "recovered"
    recovered = decision.response.result[0]
    assert recovered.tool_calls[0]["name"] == "read_file"
    assert recovered.tool_calls[0]["id"].startswith("recovered-")
    assert metrics.pseudoToolCallsRecovered == 1


def test_unknown_or_invalid_pseudo_call_is_never_executed():
    unknown, _ = inspect(
        AIMessage(
            content=[{"type": "text", "name": "delete_everything", "args": {}}]
        )
    )
    invalid, metrics = inspect(
        AIMessage(
            content=[{"type": "text", "name": "read_file", "args": "hello"}]
        )
    )

    assert unknown.status == "repair"
    assert invalid.status == "repair"
    assert metrics.toolArgumentParseFailures == 1


def test_ordinary_final_text_is_not_misclassified():
    decision, _ = inspect(AIMessage(content="I think the task is done."))
    prose_tool, _ = inspect(AIMessage(content='read_file({"file_path":"/src/a.ts"})'))

    assert decision.status == "final"
    assert prose_tool.status == "repair"


def test_missing_tool_call_id_requests_repair():
    decision, metrics = inspect(
        AIMessage(
            content="",
            tool_calls=[{"name": "read_file", "args": {"file_path": "/src/a.ts"}, "id": ""}],
        )
    )

    assert decision.status == "repair"
    assert metrics.missingToolCallIds == 1


def test_repair_response_must_be_a_tool_call():
    decision, _ = inspect(AIMessage(content="Sorry about that."), require_tool=True)
    assert decision.status == "repair"


def test_second_malformed_response_fails_after_exactly_one_repair():
    middleware = ToolProtocolMiddleware()
    request = ModelRequest(model=object(), messages=[], tools=[read_file])
    calls = 0

    def handler(_request):
        nonlocal calls
        calls += 1
        return ModelResponse(result=[AIMessage(content='read_file({"file_path":"/x"})')])

    with pytest.raises(ModelToolProtocolError) as raised:
        middleware.wrap_model_call(request, handler)

    assert raised.value.code == "MODEL_TOOL_PROTOCOL_ERROR"
    assert calls == 2
    assert middleware.metrics.protocolRepairAttempts == 1
    assert middleware.metrics.protocolRepairFailures == 1


def test_one_repair_can_restore_a_structured_tool_call():
    middleware = ToolProtocolMiddleware()
    request = ModelRequest(model=object(), messages=[], tools=[read_file])
    responses = iter(
        [
            ModelResponse(result=[AIMessage(content='read_file({"file_path":"/x"})')]),
            ModelResponse(
                result=[
                    AIMessage(
                        content="",
                        tool_calls=[
                            {
                                "name": "read_file",
                                "args": {"file_path": "/x"},
                                "id": "repair-1",
                            }
                        ],
                    )
                ]
            ),
        ]
    )

    response = middleware.wrap_model_call(request, lambda _request: next(responses))

    assert response.result[0].tool_calls[0]["id"] == "repair-1"
    assert middleware.metrics.protocolRepairAttempts == 1
    assert middleware.metrics.protocolRepairSuccesses == 1


def test_model_trace_observes_reasoning_and_retention():
    middleware = ToolProtocolMiddleware()
    request = ModelRequest(
        model=object(),
        messages=[AIMessage(content="prior", additional_kwargs={"reasoning_content": "r"})],
        tools=[read_file],
    )
    response = ModelResponse(
        result=[
            AIMessage(
                content="done",
                additional_kwargs={"reasoning_content": "next"},
                response_metadata={"finish_reason": "stop"},
                usage_metadata={"input_tokens": 10, "output_tokens": 2, "total_tokens": 12},
            )
        ]
    )

    middleware.wrap_model_call(request, lambda _request: response)

    trace = middleware.metrics.traces[0]
    assert trace.hasReasoningContent is True
    assert trace.reasoningContentRetained is True
    assert trace.inputTokens == 10
    assert trace.outputTokens == 2
