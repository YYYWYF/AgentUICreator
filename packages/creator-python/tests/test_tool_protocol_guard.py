import json

import httpx
import pytest
from langchain.agents.middleware import ModelRequest, ModelResponse
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.tools import StructuredTool, tool
from pydantic import create_model

from agent_ui_creator.model_protocol import (
    ModelToolProtocolError,
    ProviderResponseTraceCollector,
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


def _layout_tool():
    schema = create_model("RuntimeLayoutArgs", nodeRefs=(list[str] | None, None))
    return StructuredTool.from_function(
        lambda nodeRefs=None: str(nodeRefs),
        name="inspect_runtime_layout",
        description="Inspect the runtime layout.",
        args_schema=schema,
    )


def _strict_list_tool():
    schema = create_model("StrictListArgs", items=(list[str], ...))
    return StructuredTool.from_function(
        lambda items: str(items),
        name="strict_list_tool",
        description="Accept a list of items.",
        args_schema=schema,
    )


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
    assert metrics.protocolDiagnostics == []


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


def test_pydantic_argument_failure_records_bounded_shape():
    metrics = ToolProtocolMetrics(modelCalls=5)
    decision = ToolProtocolGuard(metrics).inspect(
        ModelResponse(
            result=[
                AIMessage(
                    content="",
                    tool_calls=[
                        {
                            "name": "inspect_runtime_layout",
                            "args": {"nodeRefs": "l0"},
                            "id": "call-1",
                        }
                    ],
                )
            ]
        ),
        [_layout_tool()],
    )

    assert decision.status == "repair"
    assert metrics.protocolDiagnostics == [
        {
            "kind": "tool_argument_validation_failure",
            "modelCallSequence": 5,
            "toolName": "inspect_runtime_layout",
            "argumentKeys": ["nodeRefs"],
            "argumentTypes": {"nodeRefs": "string"},
            "errorPath": ["nodeRefs"],
            "errorType": "list_type",
        }
    ]
    assert "l0" not in str(metrics.protocolDiagnostics)


def test_json_schema_extra_key_records_only_argument_shape():
    tool_definition = {
        "name": "inspect_runtime_layout",
        "function": {
            "parameters": {
                "type": "object",
                "properties": {"nodeRefs": {"type": "array"}},
                "additionalProperties": False,
            }
        },
    }
    metrics = ToolProtocolMetrics(modelCalls=3)
    decision = ToolProtocolGuard(metrics).inspect(
        ModelResponse(
            result=[
                AIMessage(
                    content="",
                    tool_calls=[
                        {
                            "name": "inspect_runtime_layout",
                            "args": {"layoutNodeIds": ["secret-node"]},
                            "id": "call-1",
                        }
                    ],
                )
            ]
        ),
        [tool_definition],
    )

    assert decision.status == "repair"
    diagnostic = metrics.protocolDiagnostics[0]
    assert diagnostic["argumentKeys"] == ["layoutNodeIds"]
    assert diagnostic["argumentTypes"] == {"layoutNodeIds": "array"}
    assert diagnostic["errorType"] == "additionalProperties"
    assert "secret-node" not in str(diagnostic)


def test_non_object_arguments_record_type_without_value():
    metrics = ToolProtocolMetrics(modelCalls=7)
    decision = ToolProtocolGuard(metrics).inspect(
        ModelResponse(
            result=[
                AIMessage(
                    content=[
                        {
                            "type": "text",
                            "name": "inspect_runtime_layout",
                            "args": "secret-argument",
                        }
                    ]
                )
            ]
        ),
        [_layout_tool()],
    )

    assert decision.status == "repair"
    assert metrics.protocolDiagnostics[0] == {
        "kind": "tool_argument_validation_failure",
        "modelCallSequence": 7,
        "toolName": "inspect_runtime_layout",
        "argumentKeys": [],
        "argumentTypes": {},
        "argumentsType": "string",
        "errorPath": [],
        "errorType": "arguments_not_object",
    }
    assert "secret-argument" not in str(metrics.protocolDiagnostics)


def test_protocol_diagnostics_keep_only_the_most_recent_32_entries():
    metrics = ToolProtocolMetrics()
    for index in range(40):
        metrics.protocolDiagnostics.append({"sequence": index})

    assert [item["sequence"] for item in metrics.to_dict()["protocolDiagnostics"]] == list(
        range(8, 40)
    )


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
    requests = []

    def handler(current_request):
        nonlocal calls
        calls += 1
        requests.append(current_request)
        return ModelResponse(result=[AIMessage(content='read_file({"file_path":"/x"})')])

    with pytest.raises(ModelToolProtocolError) as raised:
        middleware.wrap_model_call(request, handler)

    assert raised.value.code == "MODEL_TOOL_PROTOCOL_ERROR"
    assert calls == 2
    assert "Do not switch to another tool." not in requests[1].messages[-1].content
    assert "Re-issue only the intended action" in requests[1].messages[-1].content
    assert middleware.metrics.protocolRepairAttempts == 1
    assert middleware.metrics.protocolRepairFailures == 1


def test_one_repair_can_restore_a_structured_tool_call():
    middleware = ToolProtocolMiddleware()
    request = ModelRequest(model=object(), messages=[], tools=[read_file])
    responses = iter(
        [
            ModelResponse(
                result=[
                    AIMessage(
                        content="",
                        tool_calls=[
                            {
                                "name": "read_file",
                                "args": {"file_path": 1},
                                "id": "call-1",
                            }
                        ],
                    )
                ]
            ),
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

    requests = []

    def handler(current_request):
        requests.append(current_request)
        return next(responses)

    response = middleware.wrap_model_call(request, handler)

    assert response.result[0].tool_calls[0]["id"] == "repair-1"
    assert "read_file" in requests[1].messages[-1].content
    assert middleware.metrics.protocolRepairAttempts == 1
    assert middleware.metrics.protocolRepairSuccesses == 1


def test_repair_prompt_uses_current_sanitized_validation_hint():
    middleware = ToolProtocolMiddleware()
    strict_tool = _strict_list_tool()
    request = ModelRequest(model=object(), messages=[], tools=[strict_tool])
    responses = iter(
        [
            ModelResponse(
                result=[
                    AIMessage(
                        content="",
                        tool_calls=[
                            {
                                "name": "strict_list_tool",
                                "args": {"items": "secret-value"},
                                "id": "call-1",
                            }
                        ],
                    )
                ]
            ),
            ModelResponse(
                result=[
                    AIMessage(
                        content="",
                        tool_calls=[
                            {
                                "name": "strict_list_tool",
                                "args": {"items": ["x"]},
                                "id": "repair-1",
                            }
                        ],
                    )
                ]
            ),
        ]
    )
    requests = []

    def handler(current_request):
        requests.append(current_request)
        return next(responses)

    middleware.wrap_model_call(request, handler)

    repair_prompt = requests[1].messages[-1].content
    assert "`items`: expected array, received string." in repair_prompt
    assert "secret-value" not in repair_prompt
    assert "secret-value" not in json.dumps(middleware.metrics.to_dict())
    assert middleware.metrics.protocolRepairAttempts == 1
    assert middleware.metrics.protocolRepairSuccesses == 1
    assert middleware.metrics.protocolRepairFailures == 0


def test_repair_cannot_switch_away_from_the_original_structured_tool():
    middleware = ToolProtocolMiddleware()
    layout_tool = _layout_tool()
    request = ModelRequest(
        model=object(),
        messages=[],
        tools=[layout_tool, read_file],
    )
    responses = iter(
        [
            ModelResponse(
                result=[
                    AIMessage(
                        content="",
                        tool_calls=[
                            {
                                "name": "inspect_runtime_layout",
                                "args": {"nodeRefs": "l0"},
                                "id": "call-1",
                            }
                        ],
                    )
                ]
            ),
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
    requests = []

    def handler(current_request):
        requests.append(current_request)
        return next(responses)

    with pytest.raises(ModelToolProtocolError):
        middleware.wrap_model_call(request, handler)

    repair_prompt = requests[1].messages[-1].content
    assert "inspect_runtime_layout" in repair_prompt
    assert "Do not switch to another tool." in repair_prompt
    assert middleware.metrics.protocolRepairSuccesses == 0
    assert middleware.metrics.protocolRepairFailures == 1
    assert middleware.metrics.protocolDiagnostics[-1] == {
        "kind": "protocol_repair_tool_drift",
        "originalToolName": "inspect_runtime_layout",
        "repairToolName": "read_file",
        "modelCallSequence": 2,
    }


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


def test_model_trace_records_request_shape_without_request_contents():
    middleware = ToolProtocolMiddleware()
    request = ModelRequest(
        model=object(),
        system_message=SystemMessage(content="system instructions"),
        messages=[HumanMessage(content="user secret content")],
        tools=[read_file, _layout_tool()],
    )

    middleware.wrap_model_call(
        request,
        lambda _request: ModelResponse(result=[AIMessage(content="done")]),
    )

    trace = middleware.metrics.traces[0]
    assert trace.requestMessageCount == 2
    assert trace.requestMessageChars == len("system instructions") + len(
        "user secret content"
    )
    assert trace.requestToolCount == 2
    assert trace.requestToolSchemaChars > 0
    assert trace.requestMaxToolSchemaChars > 0
    assert trace.requestMaxToolSchemaName in {
        "read_file",
        "inspect_runtime_layout",
    }
    assert trace.offeredToolNames == ("read_file", "inspect_runtime_layout")
    serialized = json.dumps(trace.to_dict(), ensure_ascii=False)
    assert "user secret content" not in serialized


def _capture_provider(collector, payload, *, status_code=200):
    collector.on_response(
        httpx.Response(
            status_code,
            request=httpx.Request(
                "POST", "https://model.example/v1/chat/completions"
            ),
            json=payload,
        )
    )


def test_model_trace_pairs_final_success_after_retry_and_detects_no_mismatch():
    collector = ProviderResponseTraceCollector(enabled=True)
    _capture_provider(
        collector,
        {"error": {"type": "rate_limit"}},
        status_code=429,
    )
    _capture_provider(
        collector,
        {
            "choices": [
                {
                    "finish_reason": "tool_calls",
                    "message": {
                        "content": None,
                        "tool_calls": [
                            {
                                "function": {
                                    "name": "read_file",
                                    "arguments": '{"file_path":"/x"}',
                                }
                            }
                        ],
                    },
                }
            ]
        },
    )
    middleware = ToolProtocolMiddleware(
        raw_trace=True, provider_trace_collector=collector
    )
    request = ModelRequest(model=object(), messages=[], tools=[read_file])
    response = ModelResponse(
        result=[
            AIMessage(
                content="",
                tool_calls=[
                    {"name": "read_file", "args": {"file_path": "/x"}, "id": "call-1"}
                ],
            )
        ]
    )

    middleware.wrap_model_call(request, lambda _request: response)
    trace = middleware.metrics.traces[0]

    assert trace.providerResponse["statusCode"] == 200
    assert trace.providerResponse["httpErrorStatusCodes"] == [429]
    assert trace.translationMismatch is None
    assert trace.toolCallOrigin == "provider"
    assert trace.langChainProviderMetadata is not None


def test_model_trace_classifies_provider_tool_calls_lost_by_langchain():
    collector = ProviderResponseTraceCollector(enabled=True)
    _capture_provider(
        collector,
        {
            "choices": [
                {
                    "finish_reason": "tool_calls",
                    "message": {
                        "content": None,
                        "tool_calls": [
                            {
                                "function": {
                                    "name": "read_file",
                                    "arguments": '{"file_path":"/x"}',
                                }
                            }
                        ],
                    },
                }
            ]
        },
    )
    middleware = ToolProtocolMiddleware(
        raw_trace=True, provider_trace_collector=collector
    )
    request = ModelRequest(model=object(), messages=[], tools=[read_file])

    middleware.wrap_model_call(
        request, lambda _request: ModelResponse(result=[AIMessage(content="done")])
    )

    assert (
        middleware.metrics.traces[0].translationMismatch
        == "provider_tool_calls_lost"
    )


def test_model_trace_attributes_pseudo_tool_intent_to_provider():
    collector = ProviderResponseTraceCollector(enabled=True)
    pseudo_content = [
        {"type": "text", "name": "read_file", "args": {"file_path": "/x"}}
    ]
    _capture_provider(
        collector,
        {
            "choices": [
                {
                    "finish_reason": "stop",
                    "message": {"content": pseudo_content},
                }
            ]
        },
    )
    middleware = ToolProtocolMiddleware(
        raw_trace=True, provider_trace_collector=collector
    )
    request = ModelRequest(model=object(), messages=[], tools=[read_file])

    middleware.wrap_model_call(
        request,
        lambda _request: ModelResponse(result=[AIMessage(content=pseudo_content)]),
    )
    trace = middleware.metrics.traces[0]

    assert trace.translationMismatch is None
    assert trace.toolCallOrigin == "provider"
    assert trace.langChainPseudoToolNames == ("read_file",)


def test_model_trace_classifies_unexpected_langchain_tool_call():
    collector = ProviderResponseTraceCollector(enabled=True)
    _capture_provider(
        collector,
        {"choices": [{"finish_reason": "stop", "message": {"content": "done"}}]},
    )
    middleware = ToolProtocolMiddleware(
        raw_trace=True, provider_trace_collector=collector
    )
    request = ModelRequest(model=object(), messages=[], tools=[read_file])
    response = ModelResponse(
        result=[
            AIMessage(
                content="",
                tool_calls=[
                    {"name": "read_file", "args": {"file_path": "/x"}, "id": "call-1"}
                ],
            )
        ]
    )

    middleware.wrap_model_call(request, lambda _request: response)

    assert (
        middleware.metrics.traces[0].translationMismatch
        == "langchain_created_unexpected_tool_call"
    )
    assert middleware.metrics.traces[0].toolCallOrigin == "langchain"


def test_raw_trace_disabled_leaves_provider_and_langchain_summaries_empty():
    collector = ProviderResponseTraceCollector(enabled=False)
    middleware = ToolProtocolMiddleware(
        raw_trace=False, provider_trace_collector=collector
    )
    request = ModelRequest(model=object(), messages=[], tools=[read_file])

    middleware.wrap_model_call(
        request, lambda _request: ModelResponse(result=[AIMessage(content="done")])
    )

    trace = middleware.metrics.traces[0]
    assert trace.providerResponse is None
    assert trace.langChainProviderMetadata is None
