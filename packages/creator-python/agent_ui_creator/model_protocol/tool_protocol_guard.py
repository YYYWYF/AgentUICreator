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
from jsonschema import Draft202012Validator
from jsonschema.exceptions import ValidationError
from pydantic import ValidationError as PydanticValidationError

from ..run_control import CreatorRunControlState
from .errors import (
    AgentNoProgressError,
    ModelResponseTruncatedError,
    ModelToolProtocolError,
)
from .provider_trace import ProviderResponseTrace, ProviderResponseTraceCollector
from .request_shape import request_shape
from .trace import ModelCallTrace, ToolProtocolMetrics

logger = logging.getLogger(__name__)

PROTOCOL_REPAIR_PROMPT = """Your previous response attempted to use a tool but did not
produce a valid structured tool call.

Re-issue only the intended action using the provided structured tool interface.

Do not explain the error in prose."""
TRUNCATION_RECOVERY_PROMPT = """Your previous response reached the output limit before completing the turn.

Do not repeat the analysis.

If another action is required, emit the next structured tool call now.
If the task is already complete, return a concise final answer."""

_TOOL_INTENT_NAMES = (
    "read_file|edit_file|grep|glob|ls|inspect_ui_project|inspect_app_ui_model|"
    "list_ui_plugins|inspect_ui_slots|inspect_ui_plugin|"
    "inspect_ui_services|"
    "inspect_ui_plugin_source_references|inspect_agent_ui_sources|"
    "apply_agent_ui_source_item|mutate_ui_plugin_source|mutate_app_ui_model"
)
_TEXT_TOOL_PATTERNS = (
    re.compile(r"<function_call\b", re.IGNORECASE),
    re.compile(rf"\b(?:{_TOOL_INTENT_NAMES})\s*\(\s*[{{\[]", re.IGNORECASE),
    re.compile(rf"^[`\s]*(?:{_TOOL_INTENT_NAMES})\s*\{{", re.IGNORECASE | re.MULTILINE),
)
_MAX_TRACE_ITEMS = 64
_MAX_TRACE_LABEL_LENGTH = 120
_MAX_PROTOCOL_DIAGNOSTICS = 32
_MAX_PROTOCOL_ARGUMENT_KEYS = 32
_MAX_PROTOCOL_ERROR_PATH_ITEMS = 32
_MAX_PROTOCOL_REPAIR_HINT_LENGTH = 512
_REPAIR_EXPECTED_TYPES = {
    "list_type": "array",
    "string_type": "string",
    "dict_type": "object",
    "bool_type": "boolean",
    "int_type": "integer",
    "float_type": "number",
    "arguments_not_object": "object",
}
_SAFE_JSON_TYPES = {"null", "boolean", "integer", "number", "string", "array", "object"}


def _trace_label(value: Any) -> str:
    return str(value)[:_MAX_TRACE_LABEL_LENGTH]


def _trace_keys(value: Mapping[Any, Any]) -> list[str]:
    return sorted(_trace_label(key) for key in value)[:_MAX_TRACE_ITEMS]


@dataclass(frozen=True, slots=True)
class GuardDecision:
    response: ModelResponse[Any]
    status: Literal["final", "tool_call", "recovered", "repair", "truncated"]


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


def _json_type(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    if isinstance(value, Mapping):
        return "object"
    return "unknown"


def _argument_shape(arguments: Mapping[Any, Any]) -> dict[str, object]:
    entries = sorted(
        (
            _trace_label(key),
            _json_type(value),
        )
        for key, value in arguments.items()
    )[:_MAX_PROTOCOL_ARGUMENT_KEYS]
    return {
        "argumentKeys": [key for key, _ in entries],
        "argumentTypes": {key: value_type for key, value_type in entries},
    }


def _bounded_error_path(path: Any) -> list[object]:
    if path is None:
        return []
    try:
        values = list(path)
    except TypeError:
        return []
    return [
        value if isinstance(value, int) and not isinstance(value, bool) else _trace_label(value)
        for value in values[:_MAX_PROTOCOL_ERROR_PATH_ITEMS]
    ]


def _validation_failure(
    arguments: Any,
    *,
    error_path: Any = (),
    error_type: Any = "argument_validation_error",
) -> dict[str, object]:
    if isinstance(arguments, Mapping):
        diagnostic = _argument_shape(arguments)
    else:
        diagnostic = {
            "argumentKeys": [],
            "argumentTypes": {},
            "argumentsType": _json_type(arguments),
        }
    diagnostic["errorPath"] = _bounded_error_path(error_path)
    diagnostic["errorType"] = _trace_label(error_type)
    return diagnostic


def _validate_arguments(
    tool: Any, arguments: Any
) -> tuple[bool, dict[str, object] | None]:
    if not isinstance(arguments, Mapping):
        return False, _validation_failure(arguments, error_type="arguments_not_object")
    try:
        args_schema = getattr(tool, "args_schema", None)
        if isinstance(args_schema, Mapping):
            Draft202012Validator(dict(args_schema)).validate(dict(arguments))
            return True, None
        if hasattr(tool, "get_input_schema"):
            input_schema = tool.get_input_schema()
            model_validate = getattr(input_schema, "model_validate", None)
            if callable(model_validate):
                model_validate(dict(arguments))
                return True, None
        if isinstance(tool, Mapping):
            function = tool.get("function", tool)
            schema = function.get("parameters", {}) if isinstance(function, Mapping) else {}
            if isinstance(schema, Mapping) and schema:
                Draft202012Validator(dict(schema)).validate(dict(arguments))
            return True, None
    except PydanticValidationError as error:
        errors = error.errors(
            include_url=False,
            include_context=False,
            include_input=False,
        )
        first = errors[0] if errors else {}
        return False, _validation_failure(
            arguments,
            error_path=first.get("loc", ()),
            error_type=first.get("type", "argument_validation_error"),
        )
    except ValidationError as error:
        return False, _validation_failure(
            arguments,
            error_path=getattr(error, "absolute_path", getattr(error, "path", ())),
            error_type=getattr(error, "validator", None) or "argument_validation_error",
        )
    except (TypeError, ValueError):
        return False, _validation_failure(arguments)
    return True, None


def _record_protocol_diagnostic(
    metrics: ToolProtocolMetrics, diagnostic: Mapping[str, object]
) -> None:
    metrics.protocolDiagnostics.append(dict(diagnostic))
    del metrics.protocolDiagnostics[:-_MAX_PROTOCOL_DIAGNOSTICS]


def _record_argument_validation_failure(
    metrics: ToolProtocolMetrics,
    *,
    tool_name: str,
    metadata: Mapping[str, object],
) -> None:
    diagnostic: dict[str, object] = {
        "kind": "tool_argument_validation_failure",
        "modelCallSequence": metrics.modelCalls,
        "toolName": _trace_label(tool_name),
    }
    diagnostic.update(metadata)
    _record_protocol_diagnostic(metrics, diagnostic)


def _repair_validation_hint(
    metrics: ToolProtocolMetrics,
    *,
    model_call_sequence: int,
    expected_tool_name: str,
) -> str | None:
    expected_tool_name = _trace_label(expected_tool_name)
    diagnostic = next(
        (
            item
            for item in reversed(metrics.protocolDiagnostics)
            if isinstance(item, Mapping)
            and item.get("modelCallSequence") == model_call_sequence
            and item.get("toolName") == expected_tool_name
        ),
        None,
    )
    if diagnostic is None:
        return None

    error_type = diagnostic.get("errorType")
    if not isinstance(error_type, str):
        return None
    expected_type = _REPAIR_EXPECTED_TYPES.get(error_type)
    if expected_type is None:
        return None

    error_path = diagnostic.get("errorPath")
    if error_type == "arguments_not_object":
        argument_path = "arguments"
        actual_type = diagnostic.get("argumentsType")
    elif isinstance(error_path, list) and len(error_path) == 1:
        argument_path = error_path[0]
        argument_types = diagnostic.get("argumentTypes")
        actual_type = (
            argument_types.get(argument_path)
            if isinstance(argument_types, Mapping)
            and isinstance(argument_path, str)
            else None
        )
    elif isinstance(error_path, list) and error_path:
        path_parts = []
        for part in error_path:
            if isinstance(part, bool):
                return None
            if isinstance(part, int):
                path_parts.append(str(part))
            elif isinstance(part, str):
                path_parts.append(_trace_label(part))
            else:
                return None
        hint = f"Argument path `{'.'.join(path_parts)}` failed schema validation."
        return hint[:_MAX_PROTOCOL_REPAIR_HINT_LENGTH]
    else:
        return None

    if (
        not isinstance(argument_path, str)
        or not isinstance(actual_type, str)
        or actual_type not in _SAFE_JSON_TYPES
    ):
        return None
    hint = (
        f"`{_trace_label(argument_path)}`: expected {expected_type}, "
        f"received {actual_type}."
    )
    return hint[:_MAX_PROTOCOL_REPAIR_HINT_LENGTH]


def _call_tool_name(call: Any) -> str:
    if not isinstance(call, Mapping):
        return ""
    direct = call.get("name")
    if direct:
        return str(direct)
    function = call.get("function")
    if isinstance(function, Mapping):
        return str(function.get("name") or "")
    return ""


def _single_tool_intent_name(response: ModelResponse[Any]) -> str | None:
    message = _ai_message(response)
    if message is None:
        return None
    names = [
        *(_call_tool_name(call) for call in message.tool_calls),
        *(_call_tool_name(call) for call in message.invalid_tool_calls),
    ]
    if isinstance(message.content, list):
        names.extend(
            str(block.get("name"))
            for block in message.content
            if isinstance(block, Mapping)
            and block.get("type") == "text"
            and isinstance(block.get("name"), str)
            and "args" in block
        )
    if len(names) != 1 or not names[0]:
        return None
    return names[0]


def _repair_response_matches(
    decision: GuardDecision, expected_tool_name: str | None
) -> bool:
    if decision.status not in {"tool_call", "recovered"}:
        return False
    if expected_tool_name is None:
        return True
    return _single_tool_intent_name(decision.response) == expected_tool_name


def _ai_message(response: ModelResponse[Any]) -> AIMessage | None:
    return next(
        (message for message in reversed(response.result) if isinstance(message, AIMessage)),
        None,
    )


def _response_finish_reason(message: AIMessage) -> str | None:
    finish_reason = message.response_metadata.get("finish_reason")
    if finish_reason is None:
        finish_reason = message.response_metadata.get("stop_reason")
    return None if finish_reason is None else str(finish_reason)


def _content_block_types(message: AIMessage) -> tuple[str, ...]:
    if isinstance(message.content, str):
        return ("text",) if message.content else ()
    return tuple(
        _trace_label(block.get("type") or "unknown")
        if isinstance(block, Mapping)
        else "text"
        for block in message.content[:_MAX_TRACE_ITEMS]
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


def _pseudo_tool_names(message: AIMessage) -> tuple[str, ...]:
    if not isinstance(message.content, list):
        return ()
    return tuple(
        _trace_label(block.get("name"))
        for block in message.content[:_MAX_TRACE_ITEMS]
        if isinstance(block, Mapping)
        and block.get("type") == "text"
        and isinstance(block.get("name"), str)
        and "args" in block
    )


def _translation_mismatch(
    provider_response: ProviderResponseTrace | None,
    langchain_tool_call_count: int,
) -> str | None:
    if provider_response is None:
        return None
    if provider_response.toolCallCount > langchain_tool_call_count:
        return "provider_tool_calls_lost"
    if (
        provider_response.toolCallCount == 0
        and not provider_response.pseudoToolIntent
        and langchain_tool_call_count > 0
    ):
        return "langchain_created_unexpected_tool_call"
    return None


def _tool_call_origin(
    provider_response: ProviderResponseTrace | None,
    *,
    langchain_tool_call_count: int,
    langchain_pseudo_tool_names: tuple[str, ...],
) -> str | None:
    if provider_response is None:
        return None
    if provider_response.toolCallCount or provider_response.pseudoToolIntent:
        return "provider"
    if langchain_tool_call_count or langchain_pseudo_tool_names:
        return "langchain"
    return None


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
            for call in message.invalid_tool_calls:
                name = _call_tool_name(call)
                if not name:
                    continue
                arguments = call.get("args") if isinstance(call, Mapping) else None
                if isinstance(arguments, Mapping):
                    metadata = _argument_shape(arguments)
                else:
                    metadata = {
                        "argumentKeys": [],
                        "argumentTypes": {},
                        "argumentsType": _json_type(arguments),
                    }
                metadata["errorPath"] = []
                metadata["errorType"] = "invalid_tool_call_arguments"
                diagnostic = {
                    "kind": "tool_argument_parse_failure",
                    "modelCallSequence": self.metrics.modelCalls,
                    "toolName": _trace_label(name),
                    **metadata,
                }
                _record_protocol_diagnostic(self.metrics, diagnostic)
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
                else:
                    arguments_valid, diagnostic = _validate_arguments(tool, call.get("args"))
                    if not arguments_valid:
                        self.metrics.toolArgumentParseFailures += 1
                        if diagnostic is not None:
                            _record_argument_validation_failure(
                                self.metrics,
                                tool_name=name,
                                metadata=diagnostic,
                            )
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
                arguments_valid, diagnostic = (
                    _validate_arguments(tool, arguments) if tool is not None else (False, None)
                )
                if tool is not None and not arguments_valid and diagnostic is not None:
                    _record_argument_validation_failure(
                        self.metrics,
                        tool_name=name,
                        metadata=diagnostic,
                    )
                if (
                    tool is not None
                    and arguments_valid
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
        if _response_finish_reason(message) == "length":
            return GuardDecision(response, "truncated")
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
        provider_trace_collector: ProviderResponseTraceCollector | None = None,
        run_control: CreatorRunControlState | None = None,
    ) -> None:
        self.metrics = metrics or ToolProtocolMetrics()
        self.guard = ToolProtocolGuard(self.metrics)
        self.max_model_calls = max_model_calls
        self.raw_trace = raw_trace
        self.provider_trace_collector = provider_trace_collector
        self.run_control = run_control

    def _before_call(self) -> None:
        if self.run_control is not None:
            self.run_control.assert_runnable()
        if self.metrics.modelCalls >= self.max_model_calls:
            raise AgentNoProgressError(
                f"Minimal agent exceeded {self.max_model_calls} model calls."
            )

    def _observe_protocol_counts(self) -> None:
        if self.run_control is not None:
            self.run_control.observe_protocol_counts(
                model_calls=self.metrics.modelCalls,
                tool_calls=self.metrics.toolCalls,
            )

    def _record(
        self,
        response: ModelResponse[Any],
        request: ModelRequest,
        started_at: float,
    ) -> None:
        self.metrics.modelCalls += 1
        self._observe_protocol_counts()
        provider_response = (
            self.provider_trace_collector.pop_successful_completion()
            if self.raw_trace and self.provider_trace_collector is not None
            else None
        )
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
        finish_reason = _response_finish_reason(message)
        langchain_provider_metadata = None
        if self.raw_trace:
            langchain_provider_metadata = {
                "responseMetadataKeys": _trace_keys(message.response_metadata),
                "additionalKwargsKeys": _trace_keys(message.additional_kwargs),
                "contentType": type(message.content).__name__,
                "hasToolCalls": bool(message.tool_calls),
            }
            logger.debug(
                "creator_model_raw_trace %s",
                _bounded_json(
                    {
                        "sequence": self.metrics.modelCalls,
                        "providerResponse": (
                            None
                            if provider_response is None
                            else provider_response.to_dict()
                        ),
                        "langChainProviderMetadata": langchain_provider_metadata,
                    }
                ),
            )
        langchain_pseudo_tool_names = _pseudo_tool_names(message)
        request_shape_data = request_shape(request)
        self.metrics.traces.append(
            ModelCallTrace(
                sequence=self.metrics.modelCalls,
                durationMs=round((time.monotonic() - started_at) * 1000),
                finishReason=None if finish_reason is None else str(finish_reason),
                contentBlockTypes=_content_block_types(message),
                toolCallNames=tuple(
                    _trace_label(call.get("name") or "")
                    for call in message.tool_calls[:_MAX_TRACE_ITEMS]
                ),
                toolCallCount=len(message.tool_calls),
                invalidToolCallCount=len(message.invalid_tool_calls),
                hasReasoningContent=_has_reasoning(message),
                reasoningContentRetained=_reasoning_retained(request.messages),
                inputTokens=input_tokens if isinstance(input_tokens, int) else None,
                outputTokens=output_tokens if isinstance(output_tokens, int) else None,
                providerResponse=(
                    None if provider_response is None else provider_response.to_dict()
                ),
                langChainProviderMetadata=langchain_provider_metadata,
                langChainPseudoToolNames=langchain_pseudo_tool_names,
                translationMismatch=_translation_mismatch(
                    provider_response, len(message.tool_calls)
                ),
                toolCallOrigin=_tool_call_origin(
                    provider_response,
                    langchain_tool_call_count=len(message.tool_calls),
                    langchain_pseudo_tool_names=langchain_pseudo_tool_names,
                ),
                **request_shape_data,
            )
        )

    def _repair_request(
        self, request: ModelRequest, expected_tool_name: str | None
    ) -> ModelRequest:
        prompt = PROTOCOL_REPAIR_PROMPT
        if expected_tool_name is not None:
            validation_hint = _repair_validation_hint(
                self.metrics,
                model_call_sequence=self.metrics.modelCalls,
                expected_tool_name=expected_tool_name,
            )
            if validation_hint is not None:
                prompt = f"""Your previous call to `{expected_tool_name}` had an invalid argument shape.

{validation_hint}

Re-issue only that same tool call using valid structured arguments.
Do not switch to another tool.
Do not explain the error in prose."""
            else:
                prompt = f"""Your previous response attempted an invalid structured call to
`{expected_tool_name}`.

Re-issue only that intended action using the provided structured tool interface.
Do not switch to another tool.
Do not explain the error in prose."""
        return request.override(
            messages=[*request.messages, HumanMessage(content=prompt)]
        )

    @staticmethod
    def _truncation_recovery_request(request: ModelRequest) -> ModelRequest:
        return request.override(
            messages=[
                *request.messages,
                HumanMessage(content=TRUNCATION_RECOVERY_PROMPT),
            ]
        )

    def _finish_truncation_recovery(
        self, decision: GuardDecision
    ) -> ModelResponse[Any]:
        if decision.status in {"tool_call", "final"}:
            return decision.response
        self.metrics.modelTruncationRepairFailures += 1
        raise ModelResponseTruncatedError(
            "Creator model response remained truncated after one bounded continuation attempt."
        )

    def _record_repair_drift(
        self,
        *,
        original_tool_name: str | None,
        repaired: ModelResponse[Any],
    ) -> None:
        if original_tool_name is None:
            return
        repair_tool_name = _single_tool_intent_name(repaired)
        if repair_tool_name is None or repair_tool_name == original_tool_name:
            return
        _record_protocol_diagnostic(
            self.metrics,
            {
                "kind": "protocol_repair_tool_drift",
                "originalToolName": _trace_label(original_tool_name),
                "repairToolName": _trace_label(repair_tool_name),
                "modelCallSequence": self.metrics.modelCalls,
            },
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
        self._observe_protocol_counts()
        if decision.status == "truncated":
            self.metrics.modelTruncatedTurns += 1
            self._before_call()
            self.metrics.modelTruncationRepairAttempts += 1
            recovery_request = self._truncation_recovery_request(request)
            started_at = time.monotonic()
            recovered = handler(recovery_request)
            self._record(recovered, recovery_request, started_at)
            recovery_decision = self.guard.inspect(recovered, recovery_request.tools)
            self._observe_protocol_counts()
            return self._finish_truncation_recovery(recovery_decision)
        if decision.status != "repair":
            return decision.response
        self.metrics.protocolRepairAttempts += 1
        expected_tool_name = _single_tool_intent_name(response)
        self._before_call()
        repaired_request = self._repair_request(request, expected_tool_name)
        started_at = time.monotonic()
        repaired = handler(repaired_request)
        self._record(repaired, repaired_request, started_at)
        decision = self.guard.inspect(repaired, repaired_request.tools, require_tool=True)
        self._observe_protocol_counts()
        if _repair_response_matches(decision, expected_tool_name):
            self.metrics.protocolRepairSuccesses += 1
            return decision.response
        self._record_repair_drift(
            original_tool_name=expected_tool_name,
            repaired=repaired,
        )
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
        self._observe_protocol_counts()
        if decision.status == "truncated":
            self.metrics.modelTruncatedTurns += 1
            self._before_call()
            self.metrics.modelTruncationRepairAttempts += 1
            recovery_request = self._truncation_recovery_request(request)
            started_at = time.monotonic()
            recovered = await handler(recovery_request)
            self._record(recovered, recovery_request, started_at)
            recovery_decision = self.guard.inspect(recovered, recovery_request.tools)
            self._observe_protocol_counts()
            return self._finish_truncation_recovery(recovery_decision)
        if decision.status != "repair":
            return decision.response
        self.metrics.protocolRepairAttempts += 1
        expected_tool_name = _single_tool_intent_name(response)
        self._before_call()
        repaired_request = self._repair_request(request, expected_tool_name)
        started_at = time.monotonic()
        repaired = await handler(repaired_request)
        self._record(repaired, repaired_request, started_at)
        decision = self.guard.inspect(repaired, repaired_request.tools, require_tool=True)
        self._observe_protocol_counts()
        if _repair_response_matches(decision, expected_tool_name):
            self.metrics.protocolRepairSuccesses += 1
            return decision.response
        self._record_repair_drift(
            original_tool_name=expected_tool_name,
            repaired=repaired,
        )
        self.metrics.protocolRepairFailures += 1
        raise ModelToolProtocolError("MiMo returned malformed tool intent after one repair attempt.")
