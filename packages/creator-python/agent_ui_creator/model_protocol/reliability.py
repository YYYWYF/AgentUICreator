from __future__ import annotations

import time
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Any, Callable

import httpx
import openai
from langchain.agents.middleware import ModelRequest, ModelResponse, ModelRetryMiddleware
from langgraph.errors import GraphRecursionError

from ..observability.run_logger import CreatorRunLogger
from ..run_control import TerminalBlockerStop
from .errors import (
    AgentNoProgressError,
    ModelToolProtocolError,
    ModelTransportError,
)
from .request_shape import request_shape as model_request_shape
from .trace import ToolProtocolMetrics

_TRANSIENT_STATUS_CODES = frozenset({408, 429, 500, 502, 503, 504})
_MAX_EXCEPTION_CHAIN_DEPTH = 8
_SAFE_VALUE_LENGTH = 256


def _exception_chain(error: BaseException):
    current: BaseException | None = error
    seen: set[int] = set()
    for _ in range(_MAX_EXCEPTION_CHAIN_DEPTH):
        if current is None or id(current) in seen:
            return
        seen.add(id(current))
        yield current
        current = current.__cause__ or current.__context__


def _status_code(error: BaseException) -> int | None:
    for candidate in _exception_chain(error):
        value = getattr(candidate, "status_code", None)
        if isinstance(value, int):
            return value
    return None


def _is_semantic_failure(error: BaseException) -> bool:
    return any(
        isinstance(
            candidate,
            (
                ModelToolProtocolError,
                ModelTransportError,
                AgentNoProgressError,
                GraphRecursionError,
                TerminalBlockerStop,
            ),
        )
        for candidate in _exception_chain(error)
    )


def _is_model_transport_failure(error: BaseException) -> bool:
    if _is_semantic_failure(error):
        return False
    for candidate in _exception_chain(error):
        if isinstance(
            candidate,
            (
                httpx.TransportError,
                httpx.TimeoutException,
                openai.APIConnectionError,
                openai.APITimeoutError,
                openai.APIStatusError,
                TimeoutError,
            ),
        ):
            return True
    return False


def is_retryable_creator_model_error(error: Exception) -> bool:
    """Return whether a bounded exception chain contains a transient model error."""

    if _is_semantic_failure(error):
        return False
    for candidate in _exception_chain(error):
        if isinstance(
            candidate,
            (
                httpx.TransportError,
                httpx.TimeoutException,
                openai.APIConnectionError,
                openai.APITimeoutError,
                TimeoutError,
            ),
        ):
            return True
        if isinstance(candidate, openai.APIStatusError):
            return candidate.status_code in _TRANSIENT_STATUS_CODES
    return False


def _safe_value(value: Any) -> str | None:
    if not isinstance(value, str) or not value:
        return None
    return value[:_SAFE_VALUE_LENGTH]


def _remote_protocol_cause_message(error: BaseException) -> str | None:
    for candidate in _exception_chain(error):
        if isinstance(candidate, httpx.RemoteProtocolError):
            return _safe_value(str(candidate))
    return None


def _transport_details(error: BaseException) -> dict[str, object]:
    status_code = _status_code(error)
    provider_request_id = None
    for candidate in _exception_chain(error):
        response = getattr(candidate, "response", None)
        headers = getattr(response, "headers", None)
        if headers is not None:
            provider_request_id = _safe_value(
                headers.get("x-request-id") or headers.get("request-id")
            )
        if provider_request_id is None:
            provider_request_id = _safe_value(getattr(candidate, "request_id", None))
        if provider_request_id is not None:
            break
    chain = list(_exception_chain(error))
    cause_type = type(chain[1]).__name__ if len(chain) > 1 else None
    details: dict[str, object] = {
        "errorType": type(error).__name__,
        "causeType": cause_type,
        "statusCode": status_code,
        "providerRequestId": provider_request_id,
    }
    cause_message = _remote_protocol_cause_message(error)
    if cause_message is not None:
        details["causeMessage"] = cause_message
    return details


@dataclass(slots=True)
class _RetryCallState:
    model_call_sequence: int
    started_at: float
    attempt_started_at: float | None = None
    attempts: int = 0
    failures: int = 0
    request_shape: dict[str, object] = field(default_factory=dict)


class CreatorModelRetryMiddleware(ModelRetryMiddleware):
    """Observe the official retry middleware without owning its retry loop."""

    def __init__(
        self,
        *,
        metrics: ToolProtocolMetrics,
        max_retries: int,
        logger: CreatorRunLogger | None = None,
    ) -> None:
        self.metrics = metrics
        self.logger = logger
        self._active_call: ContextVar[_RetryCallState | None] = ContextVar(
            "creator_model_retry_call", default=None
        )
        super().__init__(
            max_retries=max_retries,
            retry_on=self._retry_on,
            on_failure="error",
            initial_delay=0.5,
            backoff_factor=2.0,
            max_delay=4.0,
            jitter=True,
        )

    def _record_transport_failure(
        self, error: Exception, state: _RetryCallState, retryable: bool
    ) -> None:
        if not _is_model_transport_failure(error):
            return
        state.failures += 1
        self.metrics.modelTransportFailures += 1
        error_type = type(error).__name__
        self.metrics.modelTransportFailuresByType[error_type] = (
            self.metrics.modelTransportFailuresByType.get(error_type, 0) + 1
        )
        will_retry = retryable and state.failures <= self.max_retries
        if will_retry:
            self.metrics.modelTransportRetries += 1
        data = {
            "modelCallSequence": max(0, int(state.model_call_sequence)),
            "attempt": max(0, int(state.attempts)),
            "retryable": retryable,
            "willRetry": will_retry,
            "durationMs": round(
                (time.monotonic() - (state.attempt_started_at or state.started_at))
                * 1000
            ),
            **state.request_shape,
            **_transport_details(error),
        }
        if self.logger is not None:
            self.logger.record("model_transport_attempt_failed", data)

    def _retry_on(self, error: Exception) -> bool:
        retryable = is_retryable_creator_model_error(error)
        state = self._active_call.get()
        if state is not None:
            self._record_transport_failure(error, state, retryable)
        return retryable

    def _normalize_exhausted_failure(
        self, error: Exception, state: _RetryCallState
    ) -> None:
        details = _transport_details(error)
        self.metrics.modelTransportRetryExhausted += 1
        if self.logger is not None:
            self.logger.record(
                "model_transport_retry_exhausted",
                {
                    "modelCallSequence": max(0, int(state.model_call_sequence)),
                    "attempts": max(0, int(state.attempts)),
                    "durationMs": round((time.monotonic() - state.started_at) * 1000),
                    **state.request_shape,
                    **details,
                },
            )
        raise ModelTransportError(
            attempts=state.attempts,
            error_type=str(details["errorType"]),
            cause_type=details["causeType"]
            if isinstance(details["causeType"], str)
            else None,
            cause_message=details["causeMessage"]
            if isinstance(details.get("causeMessage"), str)
            else None,
            status_code=details["statusCode"]
            if isinstance(details["statusCode"], int)
            else None,
            provider_request_id=details["providerRequestId"]
            if isinstance(details["providerRequestId"], str)
            else None,
        ) from error

    def _run_with_observability(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
        invoke: Callable[[ModelRequest, Callable[[ModelRequest], ModelResponse]], Any],
    ) -> Any:
        state = _RetryCallState(
            model_call_sequence=self.metrics.modelCalls + 1,
            started_at=time.monotonic(),
            request_shape=model_request_shape(request),
        )
        token = self._active_call.set(state)

        def tracked_handler(current_request: ModelRequest) -> ModelResponse:
            state.model_call_sequence = self.metrics.modelCalls + 1
            state.attempts += 1
            state.attempt_started_at = time.monotonic()
            state.request_shape = model_request_shape(current_request)
            self.metrics.modelTransportAttempts += 1
            return handler(current_request)

        try:
            response = invoke(request, tracked_handler)
            if state.failures and self.logger is not None:
                self.logger.record(
                    "model_transport_retry_recovered",
                    {
                        "modelCallSequence": max(0, int(state.model_call_sequence)),
                        "attempts": max(0, int(state.attempts)),
                        "failures": max(0, int(state.failures)),
                        "durationMs": round(
                            (time.monotonic() - state.started_at) * 1000
                        ),
                    },
                )
            return response
        except Exception as error:
            if state.failures > self.max_retries and is_retryable_creator_model_error(
                error
            ):
                self._normalize_exhausted_failure(error, state)
            raise
        finally:
            self._active_call.reset(token)

    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> Any:
        return self._run_with_observability(
            request,
            handler,
            lambda current_request, tracked_handler: super(
                CreatorModelRetryMiddleware, self
            ).wrap_model_call(current_request, tracked_handler),
        )

    async def awrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], Any],
    ) -> Any:
        state = _RetryCallState(
            model_call_sequence=self.metrics.modelCalls + 1,
            started_at=time.monotonic(),
            request_shape=model_request_shape(request),
        )
        token = self._active_call.set(state)

        async def tracked_handler(current_request: ModelRequest) -> ModelResponse:
            state.model_call_sequence = self.metrics.modelCalls + 1
            state.attempts += 1
            state.attempt_started_at = time.monotonic()
            state.request_shape = model_request_shape(current_request)
            self.metrics.modelTransportAttempts += 1
            return await handler(current_request)

        try:
            response = await super().awrap_model_call(request, tracked_handler)
            if state.failures and self.logger is not None:
                self.logger.record(
                    "model_transport_retry_recovered",
                    {
                        "modelCallSequence": max(0, int(state.model_call_sequence)),
                        "attempts": max(0, int(state.attempts)),
                        "failures": max(0, int(state.failures)),
                        "durationMs": round(
                            (time.monotonic() - state.started_at) * 1000
                        ),
                    },
                )
            return response
        except Exception as error:
            if state.failures > self.max_retries and is_retryable_creator_model_error(
                error
            ):
                self._normalize_exhausted_failure(error, state)
            raise
        finally:
            self._active_call.reset(token)


def create_creator_model_retry_middleware(
    *,
    metrics: ToolProtocolMetrics,
    max_retries: int,
    logger: CreatorRunLogger | None = None,
) -> ModelRetryMiddleware:
    """Create the shared official model retry policy for all Creator agents."""

    return CreatorModelRetryMiddleware(
        metrics=metrics,
        max_retries=max_retries,
        logger=logger,
    )
