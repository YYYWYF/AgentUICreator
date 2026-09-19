from __future__ import annotations

import inspect
import json
import re
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from time import monotonic
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import ValidationError

from ..model_protocol.reliability import create_creator_model_invocation_reliability
from ..model_protocol.provider_trace import ProviderResponseTrace, ProviderResponseTraceCollector
from ..model_settings import CreatorSelectorModelSettings, DEFAULT_CREATOR_MODEL_MAX_RETRIES
from .models import (
    CreatorActionSelection,
    CreatorActionSelectorMetrics,
    CreatorActionSelectorContext,
    InvalidActionSelectionReason,
)

MAX_ACTION_SELECTOR_REPAIR_CALLS = 1
MAX_INVALID_SELECTOR_PREVIEW_CHARACTERS = 300
ACTION_SELECTOR_PROTOCOL = "choice-text-v1"

_SELECT_PATTERN = re.compile(r"SELECT (A[1-9][0-9]*)\Z")
_CLARIFY_PATTERN = re.compile(r"CLARIFY ([^\r\n]+)\Z")
_EXPLICIT_WORKSPACE_REGION = {
    "left": re.compile(r"Workspace[. ]Left|左边|左侧|左栏|\bon (?:the )?left\b|\bto (?:the )?left\b", re.I),
    "center": re.compile(r"Workspace[. ]Center|中间|中央|\bin (?:the )?center\b|\bto (?:the )?center\b", re.I),
    "right": re.compile(r"Workspace[. ]Right|右边|右侧|右栏|\bon (?:the )?right\b|\bto (?:the )?right\b", re.I),
}
_EXPLICIT_RELATIVE_PLACEMENT = re.compile(
    r"\bbefore\b|\bafter\b|\babove\b|\bbelow\b|\bnext to\b|前面|后面|上方|下方|之前|之后",
    re.I,
)


def _explicit_workspace_region(message: str) -> str | None:
    matches = [region for region, pattern in _EXPLICIT_WORKSPACE_REGION.items() if pattern.search(message)]
    return matches[0] if len(matches) == 1 else None

_SELECTOR_SYSTEM_PROMPT = """You are the Creator Action Selector.

The Host has already determined the currently valid Product Actions. You only
select a supplied choice; you do not construct operations or execute changes.

Return exactly ONE line in one of these forms:
SELECT A<n>
GENERAL
UNSUPPORTED
CLARIFY <question>

Never invent a choice, target, placement, or mutation. Never select only one
part of a multi-action request; use UNSUPPORTED for multiple independent
Product Actions. An already_satisfied Action may still be selected.
Prefer a Workspace Region choice for top-level Left, Center, or Right semantics,
including a position described as after the main Conversation surface. Use a
relative choice for a genuinely anchor-specific, non-Workspace placement.
An explicit user placement takes precedence over a Plugin defaultPlacement.
Choose add_default only when the user did not request a location. If an exact
requested placement is unavailable, return UNSUPPORTED or CLARIFY; never select
another placement or add_default as a fallback.
Visual Remove Actions remove only UI Plugin instances. If the user clearly asks
to remove a visible panel or list, select its visual Remove Action. If the user
clearly asks to disable the underlying capability, services, or data, return
UNSUPPORTED. If their wording could mean either visual UI removal or underlying
capability removal, use CLARIFY to ask which scope they mean. A brief answer to
a previous Creator clarification may resolve the target using the bounded
previous request and clarification supplied in context.
Use GENERAL only for broader or generative implementation changes, such as
fuzzy search. Use CLARIFY when the supplied semantics cannot identify one
target or removal scope without guessing. Use UNSUPPORTED when a simple Product or Composition
request has no supplied valid choice. Return no JSON, Markdown, or explanation.
"""


class CreatorActionSelectionError(RuntimeError):
    """A bounded failure while selecting one current Host Action."""

    code = "ACTION_SELECTION_FAILED"
    details: Any

    def __init__(self, message: str, details: Any = None) -> None:
        super().__init__(message)
        self.details = details


class _InvalidActionSelection(ValueError):
    def __init__(
        self,
        reason_code: InvalidActionSelectionReason,
        message: str,
        details: Mapping[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.reason_code = reason_code
        self.details = dict(details or {})


@dataclass(frozen=True, slots=True)
class _SelectorModelResponse:
    text: object
    finish_reason: str | None
    prompt_tokens: int | None
    completion_tokens: int | None
    total_tokens: int | None
    reasoning_tokens: int | None
    resolved_model: str | None


def _token(value: object) -> int | None:
    if isinstance(value, int) and not isinstance(value, bool) and value >= 0:
        return value
    return None


def _first_token(*values: object) -> int | None:
    for value in values:
        token = _token(value)
        if token is not None:
            return token
    return None


def _model_response(result: object, trace: ProviderResponseTrace | None) -> _SelectorModelResponse:
    metadata = getattr(result, "response_metadata", None)
    usage = getattr(result, "usage_metadata", None)
    metadata = metadata if isinstance(metadata, Mapping) else {}
    usage = usage if isinstance(usage, Mapping) else {}
    raw_usage = metadata.get("token_usage")
    raw_usage = raw_usage if isinstance(raw_usage, Mapping) else {}
    output_details = usage.get("output_token_details")
    output_details = output_details if isinstance(output_details, Mapping) else {}
    completion_details = raw_usage.get("completion_tokens_details")
    completion_details = completion_details if isinstance(completion_details, Mapping) else {}
    finish = metadata.get("finish_reason")
    model = metadata.get("model_name")
    return _SelectorModelResponse(
        text=getattr(result, "content", result),
        finish_reason=getattr(trace, "finishReason", None)
        or (finish if isinstance(finish, str) else None),
        prompt_tokens=_first_token(
            getattr(trace, "promptTokens", None),
            usage.get("input_tokens"),
            raw_usage.get("prompt_tokens"),
        ),
        completion_tokens=_first_token(
            getattr(trace, "completionTokens", None),
            usage.get("output_tokens"),
            raw_usage.get("completion_tokens"),
        ),
        total_tokens=_first_token(
            getattr(trace, "totalTokens", None),
            usage.get("total_tokens"),
            raw_usage.get("total_tokens"),
        ),
        reasoning_tokens=_first_token(
            getattr(trace, "reasoningTokens", None),
            output_details.get("reasoning"),
            completion_details.get("reasoning_tokens"),
        ),
        resolved_model=getattr(trace, "responseModel", None) or (model if isinstance(model, str) else None),
    )


def _bounded_error(error: BaseException) -> str:
    return str(error).strip()[:500] or error.__class__.__name__


def _invalid_response_diagnostic(
    *,
    attempt: int,
    response: object,
    provider_trace: ProviderResponseTrace | None,
    finish_reason: str | None,
) -> dict[str, object]:
    diagnostic: dict[str, object] = {
        "attempt": attempt,
        "responseType": type(response).__name__,
        "responseLength": len(response) if isinstance(response, str) else None,
        "contentType": (
            provider_trace.contentType
            if provider_trace is not None
            else "string" if isinstance(response, str)
            else "list" if isinstance(response, list)
            else "object" if isinstance(response, Mapping)
            else "null" if response is None
            else type(response).__name__
        ),
        "contentLength": provider_trace.contentLength if provider_trace is not None else None,
        "contentBlockTypes": list(provider_trace.contentBlockTypes) if provider_trace is not None else [],
        "contentKeys": list(provider_trace.contentKeys) if provider_trace is not None else [],
        "hasReasoningContent": provider_trace.hasReasoningContent if provider_trace is not None else None,
        "finishReason": (
            provider_trace.finishReason if provider_trace is not None else finish_reason
        ),
        "toolCallCount": provider_trace.toolCallCount if provider_trace is not None else None,
        "pseudoToolIntent": provider_trace.pseudoToolIntent if provider_trace is not None else None,
        "textualToolIntent": provider_trace.textualToolIntent if provider_trace is not None else None,
    }
    if isinstance(response, str):
        diagnostic["responsePreview"] = response[:MAX_INVALID_SELECTOR_PREVIEW_CHARACTERS]
    elif isinstance(response, list):
        diagnostic["contentBlockTypes"] = [
            str(block.get("type", "unknown"))[:120]
            if isinstance(block, Mapping)
            else type(block).__name__
            for block in response[:64]
        ]
    return diagnostic


def _repair_feedback(
    *, reason_code: InvalidActionSelectionReason, choices: Mapping[str, Any]
) -> str:
    valid = ", ".join(choices)
    if reason_code == "unknown_choice_key":
        return (
            "Your previous SELECT referenced a choice that does not exist in the "
            "current request.\n\n"
            f"Select exactly one of: {valid}.\n"
            "Return exactly SELECT <valid-choice>, or use GENERAL / UNSUPPORTED / "
            "CLARIFY if semantically correct.\n"
            "Do not reinterpret the user's request."
        )
    return (
        "Your previous response did not match the Creator Action Selector protocol.\n\n"
        "Return exactly ONE line in one of these forms:\n"
        "SELECT <choice>\nGENERAL\nUNSUPPORTED\nCLARIFY <question>\n\n"
        f"Valid choices are: {valid}.\n"
        "Do not return JSON, Markdown, or explanation.\n"
        "Do not reinterpret the user's request."
    )


def _selector_prompt_context(context: CreatorActionSelectorContext) -> dict[str, object]:
    return {
        "choices": [
            {
                "choice": f"A{number}",
                "kind": candidate.kind,
                "status": candidate.status,
                "label": candidate.label,
                "description": candidate.description,
                "target": candidate.target.model_dump(mode="json", exclude_none=True),
                "effect": candidate.effect.model_dump(mode="json", exclude_none=True),
            }
            for number, candidate in enumerate(context.actions, 1)
        ],
        "pluginSemantics": [
            plugin.model_dump(mode="json", exclude_none=True)
            for plugin in context.pluginSemantics
        ],
    }


def _parse_selector_response(
    response: object, choices: Mapping[str, Any]
) -> CreatorActionSelection:
    if not isinstance(response, str):
        raise _InvalidActionSelection(
            "protocol_parse_failed", "Selector response is not one text line."
        )
    line = response.strip()
    selected = _SELECT_PATTERN.fullmatch(line)
    if selected is not None:
        key = selected.group(1)
        candidate = choices.get(key)
        if candidate is None:
            raise _InvalidActionSelection(
                "unknown_choice_key",
                "The selected choice does not exist in this request.",
                {"returnedChoice": key, "candidateCount": len(choices)},
            )
        return CreatorActionSelection(decision="select_action", actionId=candidate.actionId)
    if line == "GENERAL":
        return CreatorActionSelection(decision="general_change")
    if line == "UNSUPPORTED":
        return CreatorActionSelection(decision="unsupported_product_action")
    clarification = _CLARIFY_PATTERN.fullmatch(line)
    if clarification is not None:
        try:
            return CreatorActionSelection(
                decision="needs_clarification",
                clarificationQuestion=clarification.group(1),
            )
        except ValidationError as error:
            raise _InvalidActionSelection(
                "protocol_parse_failed",
                "Selector clarification violates the question limit.",
                {"cause": _bounded_error(error)},
            ) from error
    raise _InvalidActionSelection(
        "protocol_parse_failed", "Selector response does not match the protocol."
    )


def _coerce_context(
    value: CreatorActionSelectorContext | Mapping[str, Any],
) -> CreatorActionSelectorContext:
    if isinstance(value, CreatorActionSelectorContext):
        return value
    try:
        return CreatorActionSelectorContext.model_validate(value)
    except ValidationError as error:
        raise CreatorActionSelectionError(
            "Action Selector context is invalid.",
            {"cause": _bounded_error(error)},
        ) from error


class CreatorActionSelector:
    """Select one exact Action from the current Host-generated catalog."""

    def __init__(
        self,
        model: Any,
        *,
        max_retries: int = DEFAULT_CREATOR_MODEL_MAX_RETRIES,
        recovery_factory: Callable[[], Any] | None = None,
        selector_settings: CreatorSelectorModelSettings | None = None,
        provider_trace_collector: ProviderResponseTraceCollector | None = None,
        invalid_response_logger: Callable[[str, Mapping[str, object]], None] | None = None,
    ) -> None:
        if model is None:
            raise ValueError("A model is required.")
        self.model = model
        self.selector_settings = selector_settings or CreatorSelectorModelSettings()
        self.requested_model = getattr(model, "model_name", None)
        self._invocation_model = self._model_with_selector_budget(model)
        self._recovery_factory = recovery_factory
        self._provider_trace_collector = provider_trace_collector
        self._invalid_response_logger = invalid_response_logger
        self._invocation_reliability = create_creator_model_invocation_reliability(
            max_retries=max_retries,
            recovery_factory=(
                self._recover_invocation_model if recovery_factory is not None else None
            ),
        )
        self.metrics = CreatorActionSelectorMetrics()

    async def select(
        self,
        user_message: str,
        context: CreatorActionSelectorContext | Mapping[str, Any],
        *,
        clarification_context: Mapping[str, str] | None = None,
    ) -> CreatorActionSelection:
        started_at = monotonic()
        try:
            if not isinstance(user_message, str) or not user_message.strip():
                raise CreatorActionSelectionError(
                    "The original user message must be a non-empty string."
                )
            normalized_context = _coerce_context(context)
            choices = {
                f"A{number}": candidate
                for number, candidate in enumerate(normalized_context.actions, 1)
            }
            prompt_context = _selector_prompt_context(normalized_context)
            if clarification_context is not None:
                prompt_context["recentClarification"] = dict(clarification_context)
            context_json = json.dumps(
                prompt_context,
                ensure_ascii=False,
                separators=(",", ":"),
            )
            self.metrics.candidateCount = len(choices)
            self.metrics.contextCharacters = len(context_json)
            last_error: InvalidActionSelectionReason | None = None

            for attempt in range(MAX_ACTION_SELECTOR_REPAIR_CALLS + 1):
                if attempt > 0:
                    self.metrics.repairCalls += 1
                try:
                    result = await self._invoke(
                        user_message=user_message,
                        context=prompt_context,
                        choices=choices,
                        repair_reason=last_error,
                    )
                    provider_trace = (
                        self._provider_trace_collector.pop_successful_completion()
                        if self._provider_trace_collector is not None
                        else None
                    )
                    response = _model_response(result, provider_trace)
                    self.metrics.finishReason = response.finish_reason
                    self.metrics.promptTokens = response.prompt_tokens
                    self.metrics.completionTokens = response.completion_tokens
                    self.metrics.totalTokens = response.total_tokens
                    self.metrics.reasoningTokens = response.reasoning_tokens
                    self.metrics.resolvedModel = response.resolved_model
                    if self._invalid_response_logger is not None and provider_trace is not None:
                        try:
                            self._invalid_response_logger("action_selector_model_response", {
                                "attempt": attempt + 1,
                                "request": getattr(provider_trace, "requestSummary", None),
                                "responseModel": getattr(provider_trace, "responseModel", None),
                                "finishReason": response.finish_reason,
                                **{key: value for key, value in {
                                    "promptTokens": response.prompt_tokens,
                                    "completionTokens": response.completion_tokens,
                                    "totalTokens": response.total_tokens,
                                    "reasoningTokens": response.reasoning_tokens,
                                }.items() if value is not None},
                            })
                        except Exception:
                            pass
                    if isinstance(response.text, str) and not response.text.strip() and response.finish_reason == "length":
                        raise _InvalidActionSelection(
                            "output_budget_exhausted",
                            "Selector produced no visible choice before its output budget ended.",
                            {
                                "finishReason": "length",
                                **{key: value for key, value in {
                                    "promptTokens": response.prompt_tokens,
                                    "completionTokens": response.completion_tokens,
                                    "totalTokens": response.total_tokens,
                                    "reasoningTokens": response.reasoning_tokens,
                                }.items() if value is not None},
                            },
                        )
                    selection = _parse_selector_response(response.text, choices)
                    self.validate_selection(selection, normalized_context)
                    if selection.decision == "select_action":
                        selected = next(
                            candidate for candidate in normalized_context.actions
                            if candidate.actionId == selection.actionId
                        )
                        requested_region = _explicit_workspace_region(user_message)
                        if (selected.kind == "add_existing_plugin" and requested_region is not None and
                            (selected.effect.type != "workspace_region" or
                             selected.effect.region != requested_region)):
                            return CreatorActionSelection(decision="unsupported_product_action")
                        if (selected.kind == "add_existing_plugin" and selected.effect.type == "add_default" and
                            _EXPLICIT_RELATIVE_PLACEMENT.search(user_message)):
                            return CreatorActionSelection(decision="unsupported_product_action")
                    return selection
                except _InvalidActionSelection as error:
                    if (
                        error.reason_code in {"protocol_parse_failed", "output_budget_exhausted"}
                        and self._invalid_response_logger is not None
                    ):
                        try:
                            self._invalid_response_logger(
                                "action_selector_invalid_response",
                                {
                                    **_invalid_response_diagnostic(
                                        attempt=attempt + 1,
                                        response=response.text,
                                        provider_trace=provider_trace,
                                        finish_reason=response.finish_reason,
                                    ),
                                    "reasonCode": error.reason_code,
                                },
                            )
                        except Exception:
                            # Diagnostics must not change the selector outcome.
                            pass
                    self.metrics.invalidResponses += 1
                    if error.reason_code == "output_budget_exhausted":
                        raise CreatorActionSelectionError(
                            "Creator Action Selector exhausted its output budget.",
                            {"attempts": attempt + 1, "reasonCode": error.reason_code, **error.details},
                        ) from error
                    last_error = error.reason_code
                    if attempt == 0:
                        self.metrics.repairReasonCode = error.reason_code
                        self.metrics.repairReason = _bounded_error(error)
                    if attempt >= MAX_ACTION_SELECTOR_REPAIR_CALLS:
                        raise CreatorActionSelectionError(
                            "Creator Action Selector returned an invalid selection.",
                            {
                                "attempts": attempt + 1,
                                **error.details,
                                "reasonCode": error.reason_code,
                                "reason": _bounded_error(error),
                            },
                        ) from error

            raise AssertionError("Action Selector loop must return or raise.")
        finally:
            self.metrics.durationMs = max(
                0, round((monotonic() - started_at) * 1_000)
            )

    @staticmethod
    def validate_selection(
        selection: CreatorActionSelection,
        context: CreatorActionSelectorContext | Mapping[str, Any],
    ) -> None:
        normalized_context = _coerce_context(context)
        if selection.decision == "select_action":
            candidate_ids = [
                candidate.actionId for candidate in normalized_context.actions
            ]
            if selection.actionId not in set(candidate_ids):
                details: dict[str, Any] = {
                    "returnedActionId": selection.actionId,
                    "candidateCount": len(candidate_ids),
                }
                if len(candidate_ids) <= 32:
                    details["candidateActionIds"] = candidate_ids
                else:
                    details["candidateIdsTruncated"] = True
                raise _InvalidActionSelection(
                    "unknown_action_id",
                    "The selected actionId is not one of the supplied current Action Candidates.",
                    details,
                )

    async def _invoke(
        self,
        *,
        user_message: str,
        context: dict[str, object],
        choices: Mapping[str, Any],
        repair_reason: InvalidActionSelectionReason | None,
    ) -> object:
        messages = self._messages(
            user_message=user_message,
            context=context,
            choices=choices,
            repair_reason=repair_reason,
        )
        self.metrics.modelCalls += 1
        try:
            result = await self._invocation_reliability.ainvoke(
                self._invocation_model,
                lambda current_model: current_model.ainvoke(messages),
            )
        except Exception as error:
            raise CreatorActionSelectionError(
                "Creator Action Selector model call failed.",
                {"cause": _bounded_error(error)},
            ) from error

        return result

    async def _recover_invocation_model(self) -> Any:
        if self._recovery_factory is None:
            raise RuntimeError("An Action Selector model recovery factory is unavailable.")
        fresh_model = self._recovery_factory()
        if inspect.isawaitable(fresh_model):
            fresh_model = await fresh_model
        return self._model_with_selector_budget(fresh_model)

    def _model_with_selector_budget(self, model: Any) -> Any:
        copier = getattr(model, "model_copy", None)
        if not callable(copier):
            return model
        try:
            update = {
                "streaming": False,
                "temperature": None,
                "max_tokens": self.selector_settings.max_tokens,
            }
            if self.selector_settings.reasoning_effort is not None:
                update["reasoning_effort"] = self.selector_settings.reasoning_effort
            return copier(update=update)
        except (TypeError, ValueError):
            return model

    @staticmethod
    def _messages(
        *,
        user_message: str,
        context: dict[str, object],
        choices: Mapping[str, Any],
        repair_reason: InvalidActionSelectionReason | None,
    ) -> list[SystemMessage | HumanMessage]:
        payload: dict[str, Any] = {"userMessage": user_message, **context}
        if repair_reason is not None:
            payload["hostValidationFeedback"] = _repair_feedback(
                reason_code=repair_reason, choices=choices,
            )
        return [
            SystemMessage(content=_SELECTOR_SYSTEM_PROMPT),
            HumanMessage(
                content=json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
            ),
        ]
