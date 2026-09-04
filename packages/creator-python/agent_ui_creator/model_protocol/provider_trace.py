from __future__ import annotations

import json
import re
from collections import deque
from collections.abc import Mapping
from dataclasses import asdict, dataclass
from threading import Lock
from typing import Any

import httpx

_TEXT_TOOL_PATTERNS = (
    re.compile(r"<function_call\b", re.IGNORECASE),
    re.compile(
        r"\b(?:read_file|edit_file|grep|glob|ls)\s*\(\s*[{\[]",
        re.IGNORECASE,
    ),
    re.compile(
        r"^[`\s]*(?:read_file|edit_file|grep|glob|ls)\s*\{",
        re.IGNORECASE | re.MULTILINE,
    ),
)
_MAX_SUMMARY_ITEMS = 64
_MAX_LABEL_LENGTH = 120


def _bounded_label(value: Any, limit: int = _MAX_LABEL_LENGTH) -> str:
    return str(value)[:limit]


@dataclass(frozen=True, slots=True)
class ProviderToolCallSummary:
    name: str
    hasArguments: bool
    argumentsLength: int
    argumentsJsonValid: bool
    argumentsObject: bool


@dataclass(frozen=True, slots=True)
class ProviderResponseTrace:
    statusCode: int
    requestId: str | None
    finishReason: str | None
    bodyLength: int
    contentType: str
    contentLength: int
    contentBlockTypes: tuple[str, ...]
    contentKeys: tuple[str, ...]
    toolCallCount: int
    toolCallNames: tuple[str, ...]
    toolCalls: tuple[ProviderToolCallSummary, ...]
    hasReasoningContent: bool
    pseudoToolIntent: bool
    pseudoToolCount: int
    pseudoToolNames: tuple[str, ...]
    textualToolIntent: bool
    attemptCount: int
    httpErrorCount: int
    httpErrorStatusCodes: tuple[int, ...]
    httpErrorTypes: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        value = asdict(self)
        for key in (
            "contentBlockTypes",
            "contentKeys",
            "toolCallNames",
            "toolCalls",
            "pseudoToolNames",
            "httpErrorStatusCodes",
            "httpErrorTypes",
        ):
            value[key] = list(value[key])
        return value


def _request_id(response: httpx.Response) -> str | None:
    value = response.headers.get("x-request-id") or response.headers.get("request-id")
    return None if value is None else _bounded_label(value, 256)


def _is_chat_completion(response: httpx.Response) -> bool:
    try:
        request = response.request
    except RuntimeError:
        return False
    return (
        request.method.upper() == "POST"
        and request.url.path.rstrip("/").endswith("/chat/completions")
    )


def _error_type(payload: Any) -> str | None:
    if not isinstance(payload, Mapping):
        return None
    error = payload.get("error")
    if isinstance(error, Mapping):
        value = error.get("type") or error.get("code")
        return None if value is None else _bounded_label(value)
    return None


def _content_summary(
    content: Any,
) -> tuple[str, int, tuple[str, ...], tuple[str, ...]]:
    if isinstance(content, str):
        return "string", len(content), (), ()
    if isinstance(content, list):
        block_types = tuple(
            _bounded_label(block.get("type") or "unknown")
            if isinstance(block, Mapping)
            else _bounded_label(type(block).__name__)
            for block in content[:_MAX_SUMMARY_ITEMS]
        )
        keys = tuple(
            sorted(
                {
                    _bounded_label(key)
                    for block in content[:_MAX_SUMMARY_ITEMS]
                    if isinstance(block, Mapping)
                    for key in block
                }
            )[:_MAX_SUMMARY_ITEMS]
        )
        return (
            "list",
            len(json.dumps(content, ensure_ascii=False, default=str)),
            block_types,
            keys,
        )
    if content is None:
        return "null", 0, (), ()
    if isinstance(content, Mapping):
        return (
            "object",
            len(json.dumps(content, ensure_ascii=False, default=str)),
            (),
            tuple(
                sorted(_bounded_label(key) for key in content)[:_MAX_SUMMARY_ITEMS]
            ),
        )
    return type(content).__name__, len(str(content)), (), ()


def _tool_call_summary(tool_call: Any) -> ProviderToolCallSummary:
    function = tool_call.get("function") if isinstance(tool_call, Mapping) else None
    if not isinstance(function, Mapping):
        function = tool_call if isinstance(tool_call, Mapping) else {}
    name = _bounded_label(function.get("name") or "")
    has_arguments = "arguments" in function
    arguments = function.get("arguments")
    arguments_length = (
        len(arguments)
        if isinstance(arguments, str)
        else len(json.dumps(arguments, ensure_ascii=False, default=str))
        if has_arguments
        else 0
    )
    parsed_arguments: Any = None
    arguments_json_valid = False
    if isinstance(arguments, str):
        try:
            parsed_arguments = json.loads(arguments)
            arguments_json_valid = True
        except json.JSONDecodeError:
            pass
    elif has_arguments:
        parsed_arguments = arguments
        arguments_json_valid = True
    return ProviderToolCallSummary(
        name=name,
        hasArguments=has_arguments,
        argumentsLength=arguments_length,
        argumentsJsonValid=arguments_json_valid,
        argumentsObject=isinstance(parsed_arguments, Mapping),
    )


def _pseudo_tool_names(content: Any) -> tuple[str, ...]:
    if not isinstance(content, list):
        return ()
    return tuple(
        _bounded_label(block.get("name"))
        for block in content[:_MAX_SUMMARY_ITEMS]
        if isinstance(block, Mapping)
        and block.get("type") == "text"
        and isinstance(block.get("name"), str)
        and "args" in block
    )


class ProviderResponseTraceCollector:
    """Collect bounded Chat Completions response structure before SDK parsing."""

    def __init__(self, *, enabled: bool) -> None:
        self.enabled = enabled
        self._successful_completions: deque[ProviderResponseTrace] = deque()
        self._pending_attempts: list[tuple[int, str | None]] = []
        self._lock = Lock()

    def on_response(self, response: httpx.Response) -> None:
        if not self.enabled or not _is_chat_completion(response):
            return
        try:
            self._capture(response, response.read())
        except Exception:
            # Observability must never change the provider call outcome.
            return

    async def on_async_response(self, response: httpx.Response) -> None:
        if not self.enabled or not _is_chat_completion(response):
            return
        try:
            self._capture(response, await response.aread())
        except Exception:
            # Observability must never change the provider call outcome.
            return

    def pop_successful_completion(self) -> ProviderResponseTrace | None:
        if not self.enabled:
            return None
        with self._lock:
            return (
                self._successful_completions.popleft()
                if self._successful_completions
                else None
            )

    def _capture(self, response: httpx.Response, body: bytes) -> None:
        try:
            payload: Any = json.loads(body)
        except (UnicodeDecodeError, json.JSONDecodeError):
            payload = None
        status_code = response.status_code
        with self._lock:
            self._pending_attempts.append((status_code, _error_type(payload)))
            if not 200 <= status_code < 300:
                return
            attempts = tuple(self._pending_attempts)
            self._pending_attempts.clear()
            self._successful_completions.append(
                self._summarize(response, body, payload, attempts)
            )

    @staticmethod
    def _summarize(
        response: httpx.Response,
        body: bytes,
        payload: Any,
        attempts: tuple[tuple[int, str | None], ...],
    ) -> ProviderResponseTrace:
        choices = payload.get("choices") if isinstance(payload, Mapping) else None
        choice = choices[0] if isinstance(choices, list) and choices else {}
        if not isinstance(choice, Mapping):
            choice = {}
        message = choice.get("message")
        if not isinstance(message, Mapping):
            message = {}
        content = message.get("content")
        content_type, content_length, block_types, content_keys = _content_summary(content)
        raw_tool_calls = message.get("tool_calls")
        if not isinstance(raw_tool_calls, list):
            raw_tool_calls = []
        tool_calls = tuple(
            _tool_call_summary(call)
            for call in raw_tool_calls[:_MAX_SUMMARY_ITEMS]
        )
        pseudo_tool_count = (
            sum(
                isinstance(block, Mapping)
                and block.get("type") == "text"
                and isinstance(block.get("name"), str)
                and "args" in block
                for block in content
            )
            if isinstance(content, list)
            else 0
        )
        pseudo_tool_names = _pseudo_tool_names(content)
        has_reasoning = any(
            message.get(key) is not None
            for key in ("reasoning_content", "reasoning", "thinking")
        ) or any(block_type in {"reasoning", "thinking"} for block_type in block_types)
        error_attempts = tuple(
            (status, error_type)
            for status, error_type in attempts
            if not 200 <= status < 300
        )
        return ProviderResponseTrace(
            statusCode=response.status_code,
            requestId=_request_id(response),
            finishReason=(
                None
                if choice.get("finish_reason") is None
                else _bounded_label(choice.get("finish_reason"))
            ),
            bodyLength=len(body),
            contentType=content_type,
            contentLength=content_length,
            contentBlockTypes=block_types,
            contentKeys=content_keys,
            toolCallCount=len(raw_tool_calls),
            toolCallNames=tuple(call.name for call in tool_calls),
            toolCalls=tool_calls,
            hasReasoningContent=has_reasoning,
            pseudoToolIntent=pseudo_tool_count > 0,
            pseudoToolCount=pseudo_tool_count,
            pseudoToolNames=pseudo_tool_names,
            textualToolIntent=(
                isinstance(content, str)
                and any(pattern.search(content) for pattern in _TEXT_TOOL_PATTERNS)
            ),
            attemptCount=len(attempts),
            httpErrorCount=len(error_attempts),
            httpErrorStatusCodes=tuple(status for status, _ in error_attempts),
            httpErrorTypes=tuple(
                error_type for _, error_type in error_attempts if error_type is not None
            ),
        )
