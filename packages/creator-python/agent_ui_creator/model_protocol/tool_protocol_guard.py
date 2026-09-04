from __future__ import annotations

import json
import logging
import re
import time
from collections.abc import Awaitable, Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Literal
from uuid import uuid4

from langchain.agents.middleware import AgentMiddleware, ModelRequest, ModelResponse
from langchain_core.messages import AIMessage, HumanMessage

from .errors import AgentNoProgressError, ModelToolProtocolError
from .trace import ModelCallTrace, ToolProtocolMetrics

logger = logging.getLogger(__name__)

PROTOCOL_REPAIR_PROMPT = """Your previous response attempted to use a tool but did not
produce a valid structured tool call.

Re-issue only the intended action using the provided structured tool interface.

Do not explain the error in prose."""

_TEXT_TOOL_PATTERNS = (
    re.compile(r"<function_call\b", re.IGNORECASE),
    re.compile(r"\b(?:read_file|edit_file|grep|glob|ls)\s*\(\s*[{\[]", re.IGNORECASE),
    re.compile(r"^[`\s]*(?:read_file|edit_file|grep|glob|ls)\s*\{", re.IGNORECASE | re.MULTILINE),
)


@dataclass(frozen=True, slots=True)
class GuardDecision:
    response: ModelResponse[Any]
    status: Literal["final", "tool_call", "recovered", "repair"]


def _tool_name(tool: Any) -> str:
    if isinstance(tool, Mapping):
        direct = tool.get("name")
        if direct:
            return str(direct)
        function = tool.get("function")
        if isinstance(function, Mapping):
            return str(function.get("name") or "")
        return ""
    return str(getattr(tool, "name", "") or "")


def _arguments_are_valid(tool: Any, arguments: Any) -> bool:
    if not isinstance(arguments, Mapping):
        return False
    try:
        if hasattr(tool, "get_input_schema"):
            tool.get_input_schema().model_validate(dict(arguments))
            return True
        if isinstance(tool, Mapping):
            function = tool.get("function", tool)
            schema = function.get("parameters", {}) if isinstance(function, Mapping) else {}
            required = schema.get("required", []) if isinstance(schema, Mapping) else []
            properties = schema.get("properties", {}) if isinstance(schema, Mapping) else {}
            if any(name not in arguments for name in required):
                return False
            if isinstance(properties, Mapping):
                for name, value in arguments.items():
                    descriptor = properties.get(name)
                    expected = descriptor.get("type") if isinstance(descriptor, Mapping) else None
                    if expected == "string" and not isinstance(value, str):
                        return False
                    if expected == "object" and not isinstance(value, Mapping):
                        return False
                    if expected == "array" and not isinstance(value, list):
                        return False
            return True
    except (TypeError, ValueError):
        return False
    return True


def _ai_message(response: ModelResponse[Any]) -> AIMessage | None:
    return next(
        (message for message in reversed(response.result) if isinstance(message, AIMessage)),
        None,
    )


def _content_block_types(message: AIMessage) -> tuple[str, ...]:
    if isinstance(message.content, str):
        return ("text",) if message.content else ()
    return tuple(
        str(block.get("type") or "unknown") if isinstance(block, Mapping) else "text"
        for block in message.content
    )


def _has_reasoning(message: AIMessage) -> bool:
    if any(
        message.additional_kwargs.get(key) is not None
        for key in ("reasoning_content", "reasoning", "thinking")
    ):
        return True
    return isinstance(message.content, list) and any(
        isinstance(block, Mapping) and block.get("type") in {"reasoning", "thinking"}
        for block in message.content
    )


def _reasoning_retained(messages: Sequence[Any]) -> bool:
    return any(isinstance(message, AIMessage) and _has_reasoning(message) for message in messages)


def _bounded_json(value: Any, limit: int = 4096) -> str:
    try:
        rendered = json.dumps(value, ensure_ascii=False, default=str, separators=(",", ":"))
    except (TypeError, ValueError):
        rendered = repr(value)
    return rendered if len(rendered) <= limit else rendered[:limit] + "…"


class ToolProtocolGuard:
    """Classify MiMo responses before the agent graph chooses its next transition."""

    def __init__(self, metrics: ToolProtocolMetrics):
        self.metrics = metrics

    def inspect(
        self,
        response: ModelResponse[Any],
        tools: Sequence[Any],
        *,
        require_tool: bool = False,
    ) -> GuardDecision:
        message = _ai_message(response)
        if message is None:
            return GuardDecision(response, "repair")
        registry = {name: tool for tool in tools if (name := _tool_name(tool))}

        if message.invalid_tool_calls:
            self.metrics.invalidToolCalls += len(message.invalid_tool_calls)
            self.metrics.toolCalls += len(message.invalid_tool_calls)
            self.metrics.toolArgumentParseFailures += len(message.invalid_tool_calls)
            return GuardDecision(response, "repair")

        if message.tool_calls:
            all_valid = True
            for call in message.tool_calls:
                call_valid = True
                name = str(call.get("name") or "")
                call_id = call.get("id")
                if not isinstance(call_id, str) or not call_id:
                    self.metrics.missingToolCallIds += 1
                    all_valid = False
                    call_valid = False
                tool = registry.get(name)
                if tool is None:
                    all_valid = False
                    call_valid = False
                elif not _arguments_are_valid(tool, call.get("args")):
                    self.metrics.toolArgumentParseFailures += 1
                    all_valid = False
                    call_valid = False
                if call_valid:
                    self.metrics.validToolCalls += 1
                else:
                    self.metrics.invalidToolCalls += 1
            self.metrics.toolCalls += len(message.tool_calls)
            return GuardDecision(response, "tool_call" if all_valid else "repair")

        pseudo = self._pseudo_blocks(message)
        if pseudo:
            self.metrics.pseudoToolCallsDetected += len(pseudo)
            if len(pseudo) == 1:
                index, block = pseudo[0]
                name = str(block.get("name") or "")
                arguments = block.get("args")
                tool = registry.get(name)
                if (
                    tool is not None
                    and _arguments_are_valid(tool, arguments)
                    and not self._has_conflicting_final_text(message, index)
                ):
                    call = {
                        "name": name,
                        "args": dict(arguments),
                        "id": f"recovered-{uuid4()}",
                        "type": "tool_call",
                    }
                    content = [
                        item for block_index, item in enumerate(message.content) if block_index != index
                    ]
                    recovered = message.model_copy(
                        update={"content": content, "tool_calls": [call], "invalid_tool_calls": []}
                    )
                    replaced = ModelResponse(
                        result=[recovered if item is message else item for item in response.result],
                        structured_response=response.structured_response,
                    )
                    self.metrics.pseudoToolCallsRecovered += 1
                    self.metrics.toolCalls += 1
                    self.metrics.validToolCalls += 1
                    return GuardDecision(replaced, "recovered")
            self.metrics.toolArgumentParseFailures += int(
                any(not isinstance(block.get("args"), Mapping) for _, block in pseudo)
            )
            return GuardDecision(response, "repair")

        if self._has_textual_tool_intent(message):
            return GuardDecision(response, "repair")
        if require_tool:
            return GuardDecision(response, "repair")
        return GuardDecision(response, "final")

    @staticmethod
    def _pseudo_blocks(message: AIMessage) -> list[tuple[int, Mapping[str, Any]]]:
        if not isinstance(message.content, list):
            return []
        return [
            (index, block)
            for index, block in enumerate(message.content)
            if isinstance(block, Mapping)
            and block.get("type") == "text"
            and isinstance(block.get("name"), str)
            and "args" in block
        ]

    @staticmethod
    def _has_conflicting_final_text(message: AIMessage, pseudo_index: int) -> bool:
        if not isinstance(message.content, list):
            return False
        text = "".join(
            str(block if isinstance(block, str) else block.get("text") or "")
            for index, block in enumerate(message.content)
            if index != pseudo_index
        ).strip()
        return len(text) > 160

    @staticmethod
    def _has_textual_tool_intent(message: AIMessage) -> bool:
        if not isinstance(message.content, str):
            return False
        return any(pattern.search(message.content) for pattern in _TEXT_TOOL_PATTERNS)


class ToolProtocolMiddleware(AgentMiddleware):
    """Trace, validate, recover, and at most once repair each model response."""

    def __init__(
        self,
        *,
        metrics: ToolProtocolMetrics | None = None,
        max_model_calls: int = 12,
        raw_trace: bool = False,
    ) -> None:
        self.metrics = metrics or ToolProtocolMetrics()
        self.guard = ToolProtocolGuard(self.metrics)
        self.max_model_calls = max_model_calls
        self.raw_trace = raw_trace

    def _before_call(self) -> None:
        if self.metrics.modelCalls >= self.max_model_calls:
            raise AgentNoProgressError(
                f"Minimal agent exceeded {self.max_model_calls} model calls."
            )

    def _record(
        self,
        response: ModelResponse[Any],
        request: ModelRequest,
        started_at: float,
    ) -> None:
        self.metrics.modelCalls += 1
        message = _ai_message(response)
        if message is None:
            return
        usage = message.usage_metadata or {}
        input_tokens = usage.get("input_tokens")
        output_tokens = usage.get("output_tokens")
        if isinstance(input_tokens, int):
            self.metrics.inputTokens += input_tokens
        if isinstance(output_tokens, int):
            self.metrics.outputTokens += output_tokens
        finish_reason = message.response_metadata.get("finish_reason")
        if finish_reason is None:
            finish_reason = message.response_metadata.get("stop_reason")
        raw_provider = None
        if self.raw_trace:
            raw_provider = {
                "responseMetadata": _bounded_json(message.response_metadata),
                "additionalKwargs": _bounded_json(message.additional_kwargs),
                "contentType": type(message.content).__name__,
                "hasToolCalls": bool(message.tool_calls),
            }
            logger.info(
                "creator_model_raw_trace %s",
                _bounded_json({"sequence": self.metrics.modelCalls, **raw_provider}),
            )
        self.metrics.traces.append(
            ModelCallTrace(
                sequence=self.metrics.modelCalls,
                durationMs=round((time.monotonic() - started_at) * 1000),
                finishReason=None if finish_reason is None else str(finish_reason),
                contentBlockTypes=_content_block_types(message),
                toolCallNames=tuple(str(call.get("name") or "") for call in message.tool_calls),
                toolCallCount=len(message.tool_calls),
                invalidToolCallCount=len(message.invalid_tool_calls),
                hasReasoningContent=_has_reasoning(message),
                reasoningContentRetained=_reasoning_retained(request.messages),
                inputTokens=input_tokens if isinstance(input_tokens, int) else None,
                outputTokens=output_tokens if isinstance(output_tokens, int) else None,
                rawProvider=raw_provider,
            )
        )

    def _repair_request(self, request: ModelRequest) -> ModelRequest:
        return request.override(
            messages=[*request.messages, HumanMessage(content=PROTOCOL_REPAIR_PROMPT)]
        )

    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse[Any]],
    ) -> ModelResponse[Any]:
        self._before_call()
        started_at = time.monotonic()
        response = handler(request)
        self._record(response, request, started_at)
        decision = self.guard.inspect(response, request.tools)
        if decision.status != "repair":
            return decision.response
        self.metrics.protocolRepairAttempts += 1
        self._before_call()
        repaired_request = self._repair_request(request)
        started_at = time.monotonic()
        repaired = handler(repaired_request)
        self._record(repaired, repaired_request, started_at)
        decision = self.guard.inspect(repaired, repaired_request.tools, require_tool=True)
        if decision.status in {"tool_call", "recovered"}:
            self.metrics.protocolRepairSuccesses += 1
            return decision.response
        self.metrics.protocolRepairFailures += 1
        raise ModelToolProtocolError("MiMo returned malformed tool intent after one repair attempt.")

    async def awrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], Awaitable[ModelResponse[Any]]],
    ) -> ModelResponse[Any]:
        self._before_call()
        started_at = time.monotonic()
        response = await handler(request)
        self._record(response, request, started_at)
        decision = self.guard.inspect(response, request.tools)
        if decision.status != "repair":
            return decision.response
        self.metrics.protocolRepairAttempts += 1
        self._before_call()
        repaired_request = self._repair_request(request)
        started_at = time.monotonic()
        repaired = await handler(repaired_request)
        self._record(repaired, repaired_request, started_at)
        decision = self.guard.inspect(repaired, repaired_request.tools, require_tool=True)
        if decision.status in {"tool_call", "recovered"}:
            self.metrics.protocolRepairSuccesses += 1
            return decision.response
        self.metrics.protocolRepairFailures += 1
        raise ModelToolProtocolError("MiMo returned malformed tool intent after one repair attempt.")
