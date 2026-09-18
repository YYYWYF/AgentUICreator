from __future__ import annotations

import asyncio
import json
import random
import re
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from inspect import isawaitable
from typing import Any, Literal

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
_MAX_MODEL_TRANSPORT_ATTEMPTS = 3
_SHORT_RETRY_DELAY_SECONDS = (0.4, 0.7)
_AMBIGUOUS_DISCONNECT_DELAY_SECONDS = (2.0, 2.25)
_DUPLICATE_INFLIGHT_DELAY_SECONDS = (2.0, 3.0)
_DUPLICATE_REQUEST_PATTERN = re.compile(r"duplicate[\s_-]+request", re.IGNORECASE)
_ALREADY_PROCESSING_PATTERN = re.compile(
    r"already[\s_-]+being[\s_-]+processed", re.IGNORECASE
)

TransportFailureKind = Literal[
    "connect", "ambiguous_stream_disconnect", "other"
]
_EventFailureKind = Literal[
    "connect", "ambiguous_stream_disconnect", "duplicate_inflight", "other"
]


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
        response = getattr(candidate, "response", None)
        response_status = getattr(response, "status_code", None)
        if isinstance(response_status, int):
            return response_status
    return None


def _transport_failure_kind(error: BaseException) -> TransportFailureKind:
    """Classify only the connection failures with distinct recovery semantics."""

    for candidate in _exception_chain(error):
        if isinstance(candidate, httpx.RemoteProtocolError):
            return "ambiguous_stream_disconnect"
    for candidate in _exception_chain(error):
        if isinstance(candidate, httpx.ConnectError):
            return "connect"
    return "other"


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


def _provider_error_text(error: BaseException) -> str:
    parts: list[str] = []
    for candidate in _exception_chain(error):
        message = str(candidate)
        if message:
            parts.append(message)
        body = getattr(candidate, "body", None)
        if body is not None:
            try:
                parts.append(json.dumps(body, sort_keys=True, default=str))
            except (TypeError, ValueError):
                parts.append(str(body))
    return " ".join(parts)[:4096]


def _is_duplicate_inflight_error(error: BaseException) -> bool:
    """Match only the observed 409 duplicate-in-flight provider response."""

    for candidate in _exception_chain(error):
        if _status_code(candidate) != 409:
            continue
        text = _provider_error_text(candidate)
        if _DUPLICATE_REQUEST_PATTERN.search(text) and _ALREADY_PROCESSING_PATTERN.search(
            text
        ):
            return True
    return False


def is_retryable_creator_model_error(error: Exception) -> bool:
    """Return whether a bounded exception chain contains a transient model error."""

    if _is_semantic_failure(error):
        return False
    if _is_duplicate_inflight_error(error):
        return True
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


def _event_failure_kind(error: BaseException) -> _EventFailureKind:
    if _is_duplicate_inflight_error(error):
        return "duplicate_inflight"
    return _transport_failure_kind(error)


def _short_retry_delay() -> float:
    return random.uniform(*_SHORT_RETRY_DELAY_SECONDS)


def _ambiguous_disconnect_delay() -> float:
    return random.uniform(*_AMBIGUOUS_DISCONNECT_DELAY_SECONDS)


def _duplicate_inflight_delay() -> float:
    return random.uniform(*_DUPLICATE_INFLIGHT_DELAY_SECONDS)


def _close_client_sync(client: Any) -> None:
    close = getattr(client, "close", None)
    if callable(close):
        try:
            close()
        except Exception:
            return
        return

    aclose = getattr(client, "aclose", None)
    if not callable(aclose):
        return
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        try:
            asyncio.run(aclose())
        except Exception:
            pass


def _discard_model_sync(model: Any) -> None:
    clients: list[Any] = []
    for name in ("http_client", "http_async_client"):
        client = getattr(model, name, None)
        if client is not None and all(client is not item for item in clients):
            clients.append(client)
    for client in clients:
        _close_client_sync(client)


async def _close_client_async(client: Any) -> None:
    close = getattr(client, "close", None)
    if callable(close):
        try:
            close()
        except Exception:
            return
        return

    aclose = getattr(client, "aclose", None)
    if not callable(aclose):
        return
    try:
        result = aclose()
        if isawaitable(result):
            await result
    except Exception:
        pass


async def _discard_model_async(model: Any) -> None:
    clients: list[Any] = []
    for name in ("http_client", "http_async_client"):
        client = getattr(model, name, None)
        if client is not None and all(client is not item for item in clients):
            clients.append(client)
    for client in clients:
        await _close_client_async(client)


@dataclass(slots=True)
class _RetryCallState:
    model_call_sequence: int
    started_at: float
    attempt_started_at: float | None = None
    attempts: int = 0
    failures: int = 0
    duplicate_inflight_waits: int = 0
    request_shape: dict[str, object] = field(default_factory=dict)


class CreatorModelRetryMiddleware(ModelRetryMiddleware):
    """Bounded transport recovery for one Creator run.

    The official middleware remains the public integration point, while this
    subclass owns the small policy differences required by streaming transport:
    an ambiguous stream disconnect gets a grace wait and at most one fresh model
    client, and duplicate-in-flight 409s get one provider-specific wait/retry.
    """

    def __init__(
        self,
        *,
        metrics: ToolProtocolMetrics,
        max_retries: int,
        logger: CreatorRunLogger | None = None,
        recovery_factory: Callable[[], Any] | None = None,
    ) -> None:
        self.metrics = metrics
        self.logger = logger
        self.recovery_factory = recovery_factory
        self._fresh_model: Any | None = None
        self._fresh_client_recovery_attempted = False
        self._fresh_recovery_pending = False
        self._fresh_recovery_finalized = False
        bounded_retries = min(
            max(0, int(max_retries)), _MAX_MODEL_TRANSPORT_ATTEMPTS - 1
        )
        super().__init__(
            max_retries=bounded_retries,
            retry_on=self._retry_on,
            on_failure="error",
            initial_delay=_SHORT_RETRY_DELAY_SECONDS[0],
            backoff_factor=2.0,
            max_delay=_SHORT_RETRY_DELAY_SECONDS[1],
            jitter=True,
        )

    def _retry_on(self, error: Exception) -> bool:
        return is_retryable_creator_model_error(error)

    def _request_with_active_model(self, request: ModelRequest) -> ModelRequest:
        if self._fresh_model is None or request.model is self._fresh_model:
            return request
        return request.override(model=self._fresh_model)

    def _record_transport_failure(
        self,
        error: Exception,
        state: _RetryCallState,
        *,
        retryable: bool,
        will_retry: bool,
        failure_kind: _EventFailureKind,
        fresh_client: bool,
    ) -> None:
        if not _is_model_transport_failure(error):
            return
        state.failures += 1
        self.metrics.modelTransportFailures += 1
        error_type = type(error).__name__
        self.metrics.modelTransportFailuresByType[error_type] = (
            self.metrics.modelTransportFailuresByType.get(error_type, 0) + 1
        )
        if will_retry:
            self.metrics.modelTransportRetries += 1
        data = {
            "modelCallSequence": max(0, int(state.model_call_sequence)),
            "attempt": max(0, int(state.attempts)),
            "retryable": retryable,
            "willRetry": will_retry,
            "failureKind": failure_kind,
            "freshClient": fresh_client,
            "durationMs": round(
                (time.monotonic() - (state.attempt_started_at or state.started_at))
                * 1000
            ),
            **state.request_shape,
            **_transport_details(error),
        }
        if self.logger is not None:
            self.logger.record("model_transport_attempt_failed", data)

    def _normalize_exhausted_failure(
        self,
        error: Exception,
        state: _RetryCallState,
        *,
        failure_kind: _EventFailureKind,
        fresh_client: bool,
    ) -> None:
        details = _transport_details(error)
        self._finalize_fresh_recovery(success=False)
        self.metrics.modelTransportRetryExhausted += 1
        if self.logger is not None:
            self.logger.record(
                "model_transport_retry_exhausted",
                {
                    "modelCallSequence": max(0, int(state.model_call_sequence)),
                    "attempts": max(0, int(state.attempts)),
                    "failureKind": failure_kind,
                    "freshClient": fresh_client,
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

    def _can_start_fresh_recovery(self) -> bool:
        return (
            self._fresh_model is None
            and self.recovery_factory is not None
            and not self._fresh_client_recovery_attempted
        )

    def _begin_fresh_recovery_sync(self, current_model: Any) -> bool:
        if not self._can_start_fresh_recovery():
            return False
        self._fresh_client_recovery_attempted = True
        self._fresh_recovery_pending = True
        _discard_model_sync(current_model)
        return True

    async def _begin_fresh_recovery_async(self, current_model: Any) -> bool:
        if not self._can_start_fresh_recovery():
            return False
        self._fresh_client_recovery_attempted = True
        self._fresh_recovery_pending = True
        await _discard_model_async(current_model)
        return True

    def _finalize_fresh_recovery(self, *, success: bool) -> None:
        if not self._fresh_recovery_pending or self._fresh_recovery_finalized:
            return
        self._fresh_recovery_finalized = True
        self._fresh_recovery_pending = False
        if success:
            self.metrics.modelTransportFreshClientRecoveries += 1
        else:
            self.metrics.modelTransportFreshClientRecoveryFailures += 1

    def _create_fresh_model_sync(self, current_model: Any) -> bool:
        assert self.recovery_factory is not None
        try:
            fresh_model = self.recovery_factory()
        except Exception:
            self._finalize_fresh_recovery(success=False)
            return False
        if fresh_model is None or fresh_model is current_model or isawaitable(fresh_model):
            self._finalize_fresh_recovery(success=False)
            return False
        self._fresh_model = fresh_model
        return True

    async def _create_fresh_model_async(self, current_model: Any) -> bool:
        assert self.recovery_factory is not None
        try:
            fresh_model = self.recovery_factory()
            if isawaitable(fresh_model):
                fresh_model = await fresh_model
        except Exception:
            self._finalize_fresh_recovery(success=False)
            return False
        if fresh_model is None or fresh_model is current_model:
            self._finalize_fresh_recovery(success=False)
            return False
        self._fresh_model = fresh_model
        return True

    def _can_retry(self, error: Exception, state: _RetryCallState) -> bool:
        if not is_retryable_creator_model_error(error):
            return False
        if state.attempts >= self.max_retries + 1:
            return False
        if (
            _is_duplicate_inflight_error(error)
            and state.duplicate_inflight_waits >= 1
        ):
            return False
        return True

    def _schedule_sync(
        self,
        error: Exception,
        state: _RetryCallState,
        current_model: Any,
    ) -> bool:
        failure_kind = _event_failure_kind(error)
        if failure_kind == "duplicate_inflight":
            state.duplicate_inflight_waits += 1
            self.metrics.modelTransportDuplicateInflightWaits += 1
            time.sleep(_duplicate_inflight_delay())
            return True

        if failure_kind == "ambiguous_stream_disconnect":
            if self._begin_fresh_recovery_sync(current_model):
                time.sleep(_ambiguous_disconnect_delay())
                return self._create_fresh_model_sync(current_model)
            time.sleep(_ambiguous_disconnect_delay())
            return True

        if (
            failure_kind == "connect"
            and state.attempts == 2
            and self._begin_fresh_recovery_sync(current_model)
        ):
            time.sleep(_short_retry_delay())
            return self._create_fresh_model_sync(current_model)

        time.sleep(_short_retry_delay())
        return True

    async def _schedule_async(
        self,
        error: Exception,
        state: _RetryCallState,
        current_model: Any,
    ) -> bool:
        failure_kind = _event_failure_kind(error)
        if failure_kind == "duplicate_inflight":
            state.duplicate_inflight_waits += 1
            self.metrics.modelTransportDuplicateInflightWaits += 1
            await asyncio.sleep(_duplicate_inflight_delay())
            return True

        if failure_kind == "ambiguous_stream_disconnect":
            if await self._begin_fresh_recovery_async(current_model):
                await asyncio.sleep(_ambiguous_disconnect_delay())
                return await self._create_fresh_model_async(current_model)
            await asyncio.sleep(_ambiguous_disconnect_delay())
            return True

        if (
            failure_kind == "connect"
            and state.attempts == 2
            and await self._begin_fresh_recovery_async(current_model)
        ):
            await asyncio.sleep(_short_retry_delay())
            return await self._create_fresh_model_async(current_model)

        await asyncio.sleep(_short_retry_delay())
        return True

    def _new_state(self, request: ModelRequest) -> _RetryCallState:
        return _RetryCallState(
            model_call_sequence=self.metrics.modelCalls + 1,
            started_at=time.monotonic(),
            request_shape=model_request_shape(request),
        )

    def _record_recovered(self, state: _RetryCallState) -> None:
        if state.failures and self.logger is not None:
            self.logger.record(
                "model_transport_retry_recovered",
                {
                    "modelCallSequence": max(0, int(state.model_call_sequence)),
                    "attempts": max(0, int(state.attempts)),
                    "failures": max(0, int(state.failures)),
                    "freshClient": self._fresh_model is not None,
                    "durationMs": round(
                        (time.monotonic() - state.started_at) * 1000
                    ),
                },
            )

    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> Any:
        state = self._new_state(request)
        for _ in range(self.max_retries + 1):
            current_request = self._request_with_active_model(request)
            current_model = current_request.model
            state.attempts += 1
            state.attempt_started_at = time.monotonic()
            state.request_shape = model_request_shape(current_request)
            self.metrics.modelTransportAttempts += 1
            try:
                response = handler(current_request)
            except Exception as error:
                retryable = is_retryable_creator_model_error(error)
                failure_kind = _event_failure_kind(error)
                will_retry = self._can_retry(error, state)
                self._record_transport_failure(
                    error,
                    state,
                    retryable=retryable,
                    will_retry=will_retry,
                    failure_kind=failure_kind,
                    fresh_client=current_model is self._fresh_model
                    and self._fresh_model is not None,
                )
                if not retryable:
                    self._finalize_fresh_recovery(success=False)
                    raise
                if not will_retry:
                    self._normalize_exhausted_failure(
                        error,
                        state,
                        failure_kind=failure_kind,
                        fresh_client=current_model is self._fresh_model
                        and self._fresh_model is not None,
                    )
                if not self._schedule_sync(error, state, current_model):
                    self._normalize_exhausted_failure(
                        error,
                        state,
                        failure_kind=failure_kind,
                        fresh_client=current_model is self._fresh_model
                        and self._fresh_model is not None,
                    )
                continue
            self._finalize_fresh_recovery(success=True)
            self._record_recovered(state)
            return response

        raise RuntimeError("Creator model transport retry loop completed unexpectedly.")

    async def awrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], Awaitable[ModelResponse]],
    ) -> Any:
        state = self._new_state(request)
        for _ in range(self.max_retries + 1):
            current_request = self._request_with_active_model(request)
            current_model = current_request.model
            state.attempts += 1
            state.attempt_started_at = time.monotonic()
            state.request_shape = model_request_shape(current_request)
            self.metrics.modelTransportAttempts += 1
            try:
                response = await handler(current_request)
            except Exception as error:
                retryable = is_retryable_creator_model_error(error)
                failure_kind = _event_failure_kind(error)
                will_retry = self._can_retry(error, state)
                self._record_transport_failure(
                    error,
                    state,
                    retryable=retryable,
                    will_retry=will_retry,
                    failure_kind=failure_kind,
                    fresh_client=current_model is self._fresh_model
                    and self._fresh_model is not None,
                )
                if not retryable:
                    self._finalize_fresh_recovery(success=False)
                    raise
                if not will_retry:
                    self._normalize_exhausted_failure(
                        error,
                        state,
                        failure_kind=failure_kind,
                        fresh_client=current_model is self._fresh_model
                        and self._fresh_model is not None,
                    )
                if not await self._schedule_async(error, state, current_model):
                    self._normalize_exhausted_failure(
                        error,
                        state,
                        failure_kind=failure_kind,
                        fresh_client=current_model is self._fresh_model
                        and self._fresh_model is not None,
                    )
                continue
            self._finalize_fresh_recovery(success=True)
            self._record_recovered(state)
            return response

        raise RuntimeError("Creator model transport retry loop completed unexpectedly.")


def create_creator_model_retry_middleware(
    *,
    metrics: ToolProtocolMetrics,
    max_retries: int,
    logger: CreatorRunLogger | None = None,
    recovery_factory: Callable[[], Any] | None = None,
) -> ModelRetryMiddleware:
    """Create the shared bounded model transport policy for Creator agents."""

    return CreatorModelRetryMiddleware(
        metrics=metrics,
        max_retries=max_retries,
        logger=logger,
        recovery_factory=recovery_factory,
    )
