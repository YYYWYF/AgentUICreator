import asyncio
import json

import httpx
from langchain_core.tools import tool

from agent_ui_creator.model_factory import create_creator_chat_model
from agent_ui_creator.model_protocol import ProviderResponseTraceCollector
from agent_ui_creator.model_settings import CreatorModelSettings


@tool
def read_file(file_path: str) -> str:
    """Read a fixture file."""
    return file_path


def _response(
    payload,
    *,
    status_code=200,
    path="/v1/chat/completions",
    headers=None,
    request_headers=None,
):
    return httpx.Response(
        status_code,
        request=httpx.Request(
            "POST", f"https://model.example{path}", headers=request_headers
        ),
        headers=headers,
        json=payload,
    )


def _tool_call_payload(arguments='{"file_path":"/foo"}'):
    return {
        "id": "completion-1",
        "object": "chat.completion",
        "created": 1,
        "model": "mimo-v2.5-pro",
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {
                            "id": "call-1",
                            "type": "function",
                            "function": {
                                "name": "read_file",
                                "arguments": arguments,
                            },
                        }
                    ],
                },
                "finish_reason": "tool_calls",
            }
        ],
        "usage": {"prompt_tokens": 2, "completion_tokens": 3, "total_tokens": 5},
    }


def test_collects_bounded_structured_tool_call_summary():
    collector = ProviderResponseTraceCollector(enabled=True)
    collector.on_response(
        _response(_tool_call_payload(), headers={"x-request-id": "request-123"})
    )

    trace = collector.pop_successful_completion()

    assert trace is not None
    assert trace.statusCode == 200
    assert trace.requestId == "request-123"
    assert trace.finishReason == "tool_calls"
    assert trace.toolCallCount == 1
    assert trace.toolCallNames == ("read_file",)
    assert trace.toolCalls[0].hasArguments is True
    assert trace.toolCalls[0].argumentsJsonValid is True
    assert trace.toolCalls[0].argumentsObject is True
    assert trace.pseudoToolIntent is False


def test_detects_provider_pseudo_tool_intent_without_retaining_arguments():
    collector = ProviderResponseTraceCollector(enabled=True)
    secret = "SUPER_SECRET_SOURCE_CONTENT_123"
    collector.on_response(
        _response(
            {
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {
                            "content": [
                                {
                                    "type": "text",
                                    "name": "edit_file",
                                    "args": {"new_string": secret},
                                }
                            ]
                        },
                    }
                ]
            }
        )
    )

    trace = collector.pop_successful_completion()

    assert trace is not None
    assert trace.toolCallCount == 0
    assert trace.pseudoToolIntent is True
    assert trace.pseudoToolNames == ("edit_file",)
    assert secret not in json.dumps(trace.to_dict())


def test_structured_arguments_and_authorization_are_never_retained():
    collector = ProviderResponseTraceCollector(enabled=True)
    source_secret = "SUPER_SECRET_SOURCE_CONTENT_123"
    authorization_secret = "Bearer SUPER_SECRET_API_KEY_456"
    collector.on_response(
        _response(
            _tool_call_payload(
                json.dumps({"file_path": "/foo", "new_string": source_secret})
            ),
            request_headers={"Authorization": authorization_secret},
        )
    )

    trace = collector.pop_successful_completion()
    assert trace is not None
    rendered = str(trace)
    assert source_secret not in rendered
    assert authorization_secret not in rendered


def test_ordinary_final_response_has_no_tool_intent():
    collector = ProviderResponseTraceCollector(enabled=True)
    collector.on_response(
        _response(
            {
                "choices": [
                    {"finish_reason": "stop", "message": {"content": "Done."}}
                ]
            }
        )
    )

    trace = collector.pop_successful_completion()

    assert trace is not None
    assert trace.toolCallCount == 0
    assert trace.pseudoToolIntent is False
    assert trace.textualToolIntent is False


def test_retry_attempts_are_attached_only_to_the_following_success():
    collector = ProviderResponseTraceCollector(enabled=True)
    collector.on_response(
        _response(
            {"error": {"type": "rate_limit", "message": "do not retain me"}},
            status_code=429,
        )
    )
    assert collector.pop_successful_completion() is None

    collector.on_response(_response(_tool_call_payload()))
    trace = collector.pop_successful_completion()

    assert trace is not None
    assert trace.attemptCount == 2
    assert trace.httpErrorCount == 1
    assert trace.httpErrorStatusCodes == (429,)
    assert trace.httpErrorTypes == ("rate_limit",)


def test_disabled_collector_does_not_read_or_parse_response_body():
    collector = ProviderResponseTraceCollector(enabled=False)
    response = httpx.Response(
        200,
        request=httpx.Request("POST", "https://model.example/v1/chat/completions"),
        stream=httpx.ByteStream(json.dumps(_tool_call_payload()).encode()),
    )

    collector.on_response(response)

    assert response.is_stream_consumed is False
    assert collector.pop_successful_completion() is None


def test_non_chat_completion_response_is_ignored_without_reading_body():
    collector = ProviderResponseTraceCollector(enabled=True)
    response = httpx.Response(
        200,
        request=httpx.Request("GET", "https://model.example/v1/models"),
        stream=httpx.ByteStream(b'{"data":[]}'),
    )

    collector.on_response(response)

    assert response.is_stream_consumed is False
    assert collector.pop_successful_completion() is None


def test_sync_http_hook_preserves_openai_and_langchain_tool_call_parsing():
    collector = ProviderResponseTraceCollector(enabled=True)
    transport = httpx.MockTransport(
        lambda _request: httpx.Response(200, json=_tool_call_payload())
    )
    model = create_creator_chat_model(
        CreatorModelSettings(
            model_name="mimo-v2.5-pro",
            base_url="https://model.example/v1",
            api_key="secret-api-key",
        ),
        provider_trace_collector=collector,
        http_transport=transport,
        http_async_transport=transport,
    )

    message = model.bind_tools([read_file]).invoke("Read /foo")
    trace = collector.pop_successful_completion()

    assert message.tool_calls[0]["name"] == "read_file"
    assert trace is not None
    assert trace.toolCallNames == ("read_file",)
    assert "secret-api-key" not in json.dumps(trace.to_dict())


def test_async_http_hook_preserves_openai_and_langchain_tool_call_parsing():
    collector = ProviderResponseTraceCollector(enabled=True)
    transport = httpx.MockTransport(
        lambda _request: httpx.Response(200, json=_tool_call_payload())
    )
    model = create_creator_chat_model(
        CreatorModelSettings(
            model_name="mimo-v2.5-pro",
            base_url="https://model.example/v1",
            api_key="secret-api-key",
        ),
        provider_trace_collector=collector,
        http_transport=transport,
        http_async_transport=transport,
    )

    message = asyncio.run(model.bind_tools([read_file]).ainvoke("Read /foo"))
    trace = collector.pop_successful_completion()

    assert message.tool_calls[0]["name"] == "read_file"
    assert trace is not None
    assert trace.toolCallNames == ("read_file",)
