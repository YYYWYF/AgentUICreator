from __future__ import annotations

import asyncio
import json
from collections.abc import Iterable

import httpx
import openai
import pytest
from langchain.agents.middleware import ModelRequest, ModelResponse, ModelRetryMiddleware
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langgraph.errors import GraphRecursionError

from agent_ui_creator.domain_agent import (
    create_domain_read_creator_agent,
    create_domain_write_creator_agent,
)
from agent_ui_creator.minimal_agent import create_minimal_creator_agent
from agent_ui_creator.model_protocol.errors import (
    AgentNoProgressError,
    ModelToolProtocolError,
    ModelTransportError,
)
from agent_ui_creator.model_protocol.reliability import (
    create_creator_model_retry_middleware,
    is_retryable_creator_model_error,
)
from agent_ui_creator.model_protocol.tool_protocol_guard import ToolProtocolMiddleware
from agent_ui_creator.model_protocol.trace import ToolProtocolMetrics
from agent_ui_creator.observability import CreatorRunLogger


REQUEST = httpx.Request("POST", "https://model.example/v1/chat/completions")


def _connection_error() -> openai.APIConnectionError:
    error = openai.APIConnectionError(request=REQUEST)
    error.__cause__ = httpx.ConnectError("connection reset", request=REQUEST)
    return error


def _status_error(status_code: int) -> openai.APIStatusError:
    response = httpx.Response(
        status_code,
        request=REQUEST,
        headers={"x-request-id": f"request-{status_code}"},
    )
    return openai.APIStatusError(
        f"synthetic status {status_code}",
        response=response,
        body={"error": {"type": "synthetic"}},
    )


def _invoke_script(
    script: Iterable[object],
    *,
    max_retries: int = 2,
    logger: CreatorRunLogger | None = None,
):
    metrics = ToolProtocolMetrics()
    retry = create_creator_model_retry_middleware(
        metrics=metrics,
        max_retries=max_retries,
        logger=logger,
    )
    protocol = ToolProtocolMiddleware(metrics=metrics)
    request = ModelRequest(model=object(), messages=[])
    scripted = iter(script)

    def provider(_request):
        item = next(scripted)
        if isinstance(item, BaseException):
            raise item
        assert isinstance(item, ModelResponse)
        return item

    response = retry.wrap_model_call(
        request,
        lambda current_request: protocol.wrap_model_call(current_request, provider),
    )
    return response, metrics


def _response(content: str = "ok") -> ModelResponse:
    return ModelResponse(result=[AIMessage(content=content)])


def _tool_response(name: str, call_id: str) -> ModelResponse:
    return ModelResponse(
        result=[
            AIMessage(
                content="",
                tool_calls=[{"name": name, "args": {}, "id": call_id}],
            )
        ]
    )


def _tool(name: str):
    return type("ScriptedTool", (), {"name": name, "args_schema": None})()


def _events(logger: CreatorRunLogger) -> list[dict]:
    assert logger.path is not None
    return [
        json.loads(line)
        for line in logger.path.read_text(encoding="utf-8").splitlines()
    ]


def test_transient_failure_then_success_has_one_logical_model_call(monkeypatch):
    monkeypatch.setattr("langchain.agents.middleware.model_retry.time.sleep", lambda _: None)

    _, metrics = _invoke_script([_connection_error(), _response()])

    assert metrics.modelCalls == 1
    assert metrics.modelTransportAttempts == 2
    assert metrics.modelTransportFailures == 1
    assert metrics.modelTransportRetries == 1
    assert metrics.modelTransportRetryExhausted == 0


def test_transient_failure_recovery_is_written_to_creator_jsonl(monkeypatch, tmp_path):
    monkeypatch.setattr("langchain.agents.middleware.model_retry.time.sleep", lambda _: None)
    logger = CreatorRunLogger(tmp_path)
    logger.begin(run_id="retry-recovered", agent_mode="minimal")

    _invoke_script([_connection_error(), _response()], logger=logger)

    events = _events(logger)
    assert [event["type"] for event in events] == [
        "run_started",
        "model_transport_attempt_failed",
        "model_transport_retry_recovered",
    ]
    assert events[1]["data"]["errorType"] == "APIConnectionError"
    assert events[1]["data"]["causeType"] == "ConnectError"
    assert events[2]["data"]["attempts"] == 2


def test_multiple_transient_failures_then_success_are_bounded(monkeypatch):
    monkeypatch.setattr("langchain.agents.middleware.model_retry.time.sleep", lambda _: None)

    _, metrics = _invoke_script(
        [_connection_error(), _status_error(503), _response()]
    )

    assert metrics.modelCalls == 1
    assert metrics.modelTransportAttempts == 3
    assert metrics.modelTransportFailures == 2
    assert metrics.modelTransportRetries == 2
    assert metrics.modelTransportFailuresByType == {
        "APIConnectionError": 1,
        "APIStatusError": 1,
    }


def test_async_model_retry_uses_the_same_bounded_policy(monkeypatch):
    async def no_sleep(_):
        return None

    monkeypatch.setattr("langchain.agents.middleware.model_retry.asyncio.sleep", no_sleep)
    metrics = ToolProtocolMetrics()
    retry = create_creator_model_retry_middleware(metrics=metrics, max_retries=2)
    protocol = ToolProtocolMiddleware(metrics=metrics)
    request = ModelRequest(model=object(), messages=[])
    script = iter([_connection_error(), _response()])

    async def provider(_request):
        item = next(script)
        if isinstance(item, BaseException):
            raise item
        return item

    async def run():
        return await retry.awrap_model_call(
            request,
            lambda current_request: protocol.awrap_model_call(
                current_request, provider
            ),
        )

    response = asyncio.run(run())

    assert response.result[0].content == "ok"
    assert metrics.modelCalls == 1
    assert metrics.modelTransportAttempts == 2
    assert metrics.modelTransportRetries == 1


@pytest.mark.parametrize(
    "error",
    [_status_error(400), _status_error(401), ModelToolProtocolError("bad tool protocol")],
)
def test_non_retryable_model_failures_are_not_retried(error):
    metrics = ToolProtocolMetrics()
    retry = create_creator_model_retry_middleware(metrics=metrics, max_retries=2)
    request = ModelRequest(model=object(), messages=[])

    def provider(_request):
        raise error

    with pytest.raises(type(error)):
        retry.wrap_model_call(request, provider)

    assert metrics.modelTransportAttempts == 1
    assert metrics.modelTransportRetries == 0
    if isinstance(error, ModelToolProtocolError):
        assert metrics.modelTransportFailures == 0
    else:
        assert metrics.modelTransportFailures == 1


def test_exhausted_transport_retry_is_structured_and_retains_cause(monkeypatch):
    monkeypatch.setattr("langchain.agents.middleware.model_retry.time.sleep", lambda _: None)
    errors = [_connection_error(), _connection_error(), _connection_error()]

    with pytest.raises(ModelTransportError) as raised:
        _invoke_script(errors)

    error = raised.value
    assert error.code == "MODEL_TRANSPORT_RETRY_EXHAUSTED"
    assert error.category == "infrastructure"
    assert error.recoverable is True
    assert error.attempts == 3
    assert error.__cause__ is errors[-1]


def test_exhausted_transport_retry_logs_bounded_failure_events(monkeypatch, tmp_path):
    monkeypatch.setattr("langchain.agents.middleware.model_retry.time.sleep", lambda _: None)
    logger = CreatorRunLogger(tmp_path)
    logger.begin(run_id="retry-log", agent_mode="minimal")

    with pytest.raises(ModelTransportError) as raised:
        _invoke_script(
            [_connection_error(), _connection_error(), _connection_error()],
            logger=logger,
        )
    logger.finish("error", error=raised.value)

    events = _events(logger)
    failures = [event for event in events if event["type"] == "model_transport_attempt_failed"]
    exhausted = [
        event for event in events if event["type"] == "model_transport_retry_exhausted"
    ]
    assert len(failures) == 3
    assert len(exhausted) == 1
    finished = next(event for event in events if event["type"] == "run_finished")
    assert finished["data"]["errorDetails"] == {
        "category": "infrastructure",
        "code": "MODEL_TRANSPORT_RETRY_EXHAUSTED",
        "recoverable": True,
        "attempts": 3,
        "errorType": "APIConnectionError",
        "causeType": "ConnectError",
        "statusCode": None,
        "providerRequestId": None,
    }
    assert failures[0]["data"] == {
        "modelCallSequence": 1,
        "attempt": 1,
        "retryable": True,
        "willRetry": True,
        "durationMs": failures[0]["data"]["durationMs"],
        "errorType": "APIConnectionError",
        "causeType": "ConnectError",
        "statusCode": None,
        "providerRequestId": None,
    }


def test_successful_tool_is_not_replayed_after_next_model_retry(monkeypatch):
    monkeypatch.setattr("langchain.agents.middleware.model_retry.time.sleep", lambda _: None)

    metrics = ToolProtocolMetrics()
    retry = create_creator_model_retry_middleware(metrics=metrics, max_retries=2)
    protocol = ToolProtocolMiddleware(metrics=metrics)
    request = ModelRequest(
        model=object(),
        messages=[],
        tools=[_tool("tool_a"), _tool("mutate_app_ui_model")],
    )
    script = iter([_tool_response("tool_a", "tool-a"), _connection_error(), _response("done")])
    tool_a_executions = 0

    def provider(_request):
        item = next(script)
        if isinstance(item, BaseException):
            raise item
        return item

    def model_round(current_request):
        return retry.wrap_model_call(
            current_request,
            lambda nested_request: protocol.wrap_model_call(nested_request, provider),
        )

    first = model_round(request)
    assert first.result[0].tool_calls[0]["name"] == "tool_a"
    tool_a_executions += 1
    second = model_round(
        request.override(
            messages=[
                first.result[0],
                HumanMessage(content="continue"),
                ToolMessage(content="tool succeeded", tool_call_id="tool-a"),
            ]
        )
    )

    assert second.result[0].content == "done"
    assert tool_a_executions == 1
    assert metrics.modelCalls == 2
    assert metrics.modelTransportAttempts == 3


def test_successful_mutation_is_not_replayed_after_next_model_retry(monkeypatch):
    monkeypatch.setattr("langchain.agents.middleware.model_retry.time.sleep", lambda _: None)

    metrics = ToolProtocolMetrics()
    retry = create_creator_model_retry_middleware(metrics=metrics, max_retries=2)
    protocol = ToolProtocolMiddleware(metrics=metrics)
    request = ModelRequest(
        model=object(),
        messages=[],
        tools=[_tool("mutate_app_ui_model")],
    )
    script = iter(
        [
            _tool_response("mutate_app_ui_model", "mutation-1"),
            _connection_error(),
            _response("done"),
        ]
    )
    mutation_requests = 0

    def provider(_request):
        item = next(script)
        if isinstance(item, BaseException):
            raise item
        return item

    def model_round(current_request):
        return retry.wrap_model_call(
            current_request,
            lambda nested_request: protocol.wrap_model_call(nested_request, provider),
        )

    first = model_round(request)
    assert first.result[0].tool_calls[0]["name"] == "mutate_app_ui_model"
    mutation_requests += 1
    second = model_round(
        request.override(
            messages=[
                first.result[0],
                ToolMessage(content='{"ok":true}', tool_call_id="mutation-1"),
            ]
        )
    )

    assert second.result[0].content == "done"
    assert mutation_requests == 1
    assert metrics.modelCalls == 2
    assert metrics.modelTransportAttempts == 3


def test_completion_repair_round_uses_the_same_transport_retry(monkeypatch):
    monkeypatch.setattr("langchain.agents.middleware.model_retry.time.sleep", lambda _: None)

    metrics = ToolProtocolMetrics()
    retry = create_creator_model_retry_middleware(metrics=metrics, max_retries=2)
    protocol = ToolProtocolMiddleware(metrics=metrics)
    request = ModelRequest(model=object(), messages=[HumanMessage(content="request")])
    script = iter([_response("needs repair"), _connection_error(), _response("complete")])

    def provider(_request):
        item = next(script)
        if isinstance(item, BaseException):
            raise item
        return item

    def invoke(current_request):
        return retry.wrap_model_call(
            current_request,
            lambda nested_request: protocol.wrap_model_call(nested_request, provider),
        )

    initial = invoke(request)
    repaired = invoke(
        request.override(
            messages=[
                *request.messages,
                initial.result[0],
                HumanMessage(content="Please complete the response."),
            ]
        )
    )

    assert initial.result[0].content == "needs repair"
    assert repaired.result[0].content == "complete"
    assert metrics.modelCalls == 2
    assert metrics.modelTransportAttempts == 3
    assert metrics.modelTransportRetries == 1


def test_creator_factories_place_shared_retry_outside_protocol(monkeypatch, tmp_path):
    captured = []

    def fake_create_deep_agent(**kwargs):
        captured.append(kwargs["middleware"])
        return object()

    monkeypatch.setattr(
        "agent_ui_creator.minimal_agent.agent.create_deep_agent",
        fake_create_deep_agent,
    )
    monkeypatch.setattr(
        "agent_ui_creator.domain_agent.agent.create_deep_agent",
        fake_create_deep_agent,
    )

    model = object()
    create_minimal_creator_agent(model=model, workspace=tmp_path)
    create_domain_read_creator_agent(model=model, workspace=tmp_path)
    create_domain_write_creator_agent(model=model, workspace=tmp_path)

    for middleware in captured:
        names = [type(item).__name__ for item in middleware]
        retry = next(item for item in middleware if type(item).__name__ == "CreatorModelRetryMiddleware")
        assert isinstance(retry, ModelRetryMiddleware)
        assert retry.max_retries == 2
        assert names.index(type(retry).__name__) < names.index("ToolProtocolMiddleware")


def test_retry_predicate_rejects_semantic_and_permanent_errors():
    assert is_retryable_creator_model_error(_connection_error()) is True
    assert is_retryable_creator_model_error(openai.APITimeoutError(REQUEST)) is True
    assert is_retryable_creator_model_error(_status_error(503)) is True
    assert is_retryable_creator_model_error(_status_error(429)) is True
    assert is_retryable_creator_model_error(_status_error(400)) is False
    assert is_retryable_creator_model_error(_status_error(401)) is False
    assert is_retryable_creator_model_error(ModelToolProtocolError("invalid JSON")) is False
    assert is_retryable_creator_model_error(AgentNoProgressError("no progress")) is False
    assert is_retryable_creator_model_error(GraphRecursionError("recursion")) is False
