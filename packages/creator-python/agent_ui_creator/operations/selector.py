from __future__ import annotations

import inspect
import json
from collections.abc import Callable, Mapping
from time import monotonic
from typing import Any, Literal

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import ValidationError

from ..model_protocol.reliability import create_creator_model_invocation_reliability
from ..model_settings import DEFAULT_CREATOR_MODEL_MAX_RETRIES
from .models import (
    CreatorActionSelection,
    CreatorActionSelectorMetrics,
    CreatorActionSelectorContext,
)

MAX_ACTION_SELECTOR_REPAIR_CALLS = 1
MAX_ACTION_SELECTOR_OUTPUT_TOKENS = 256

InvalidActionSelectionReason = Literal[
    "structured_parse_failed",
    "schema_validation_failed",
    "unknown_action_id",
]

_SELECTOR_SYSTEM_PROMPT = """You are the Creator Action Selector.

The Host has already determined which Product Actions are currently valid. You
do not construct operations and you do not execute anything.

You may only:
1. select exactly one supplied actionId;
2. ask one concise clarification question;
3. classify a genuinely broader or generative request as general_change; or
4. report unsupported_product_action when a simple Product or Composition
   request has no supplied Action that represents it.

Never invent an actionId, target, placement, anchor, parent, Slot, or mutation.
Never infer meaning from an actionId. Copy an exact supplied actionId only
after matching the human-readable candidate semantics.
Never choose only one part of a multi-part request. The current selector
supports one Product Action at a time, so a request containing multiple
independent actions is unsupported_product_action.

An already_satisfied candidate is still a valid selectable Action. For
top-level Workspace placement, prefer a supplied workspace_region Action
whenever it represents the requested Left, Center, or Right destination, even
when the user describes that destination relative to the main conversation
surface, such as "after Conversation". Do not translate Workspace placement
into relative placement yourself. Use a supplied relative Action only when no
Workspace Region Action represents the requested placement and the supplied
Action is truly an anchor-specific, non-Workspace placement (for example, the
user explicitly names another Plugin as the anchor).

Use general_change for behavior or implementation changes, such as changing a
Plugin's rendering or adding fuzzy search. Use needs_clarification only when
the supplied semantic metadata cannot identify one target without guessing.

Return only the structured selection schema.
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


def _bounded_error(error: BaseException) -> str:
    return str(error).strip()[:500] or error.__class__.__name__


def _repair_feedback(
    *, reason_code: InvalidActionSelectionReason, reason: str
) -> str:
    if reason_code == "unknown_action_id":
        return (
            "Your previous selection used an actionId that is not one of the "
            "supplied current Action Candidates.\n\n"
            "Copy exactly one actionId from actionSelectorContext.actions.\n\n"
            "Do not:\n"
            "- invent an actionId\n"
            "- shorten it\n"
            "- transform it\n"
            "- reuse an id from another request\n\n"
            "Do not reinterpret the original user request.\n"
            f"Host validation reason: {reason}"
        )
    if reason_code == "schema_validation_failed":
        return (
            "Your previous structured response did not satisfy the "
            "CreatorActionSelection schema.\n\n"
            "Return exactly one valid decision.\n\n"
            "For select_action:\n"
            '- decision = "select_action"\n'
            "- actionId = one exact supplied actionId\n"
            "- clarificationQuestion = null / omitted\n\n"
            "For needs_clarification:\n"
            '- decision = "needs_clarification"\n'
            "- actionId = null / omitted\n"
            "- clarificationQuestion = non-empty\n\n"
            "For general_change and unsupported_product_action:\n"
            "- actionId = null / omitted\n"
            "- clarificationQuestion = null / omitted\n\n"
            "Do not reinterpret the original user request.\n"
            f"Host validation reason: {reason}"
        )
    return (
        "Your previous response could not be parsed as the required "
        "structured CreatorActionSelection.\n\n"
        "Return only a valid structured result matching the supplied schema.\n\n"
        "Do not add prose.\n"
        "Do not construct an operation.\n"
        "Do not reinterpret the original user request.\n"
        f"Host validation reason: {reason}"
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
        model: Any | None = None,
        *,
        structured_model: Any | None = None,
        max_retries: int = DEFAULT_CREATOR_MODEL_MAX_RETRIES,
        recovery_factory: Callable[[], Any] | None = None,
    ) -> None:
        if model is None and structured_model is None:
            raise ValueError("A model or structured_model is required.")
        self.model = model
        self._structured_model = structured_model
        self._structured_model_supplied = structured_model is not None
        self._invocation_model: Any | None = None
        self._recovery_factory = recovery_factory
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
    ) -> CreatorActionSelection:
        started_at = monotonic()
        try:
            if not isinstance(user_message, str) or not user_message.strip():
                raise CreatorActionSelectionError(
                    "The original user message must be a non-empty string."
                )
            normalized_context = _coerce_context(context)
            context_json = json.dumps(
                normalized_context.model_dump(mode="json", exclude_none=True),
                ensure_ascii=False,
                separators=(",", ":"),
            )
            self.metrics.candidateCount = len(normalized_context.actions)
            self.metrics.contextCharacters = len(context_json)
            last_error: tuple[InvalidActionSelectionReason, str] | None = None

            for attempt in range(MAX_ACTION_SELECTOR_REPAIR_CALLS + 1):
                if attempt > 0:
                    self.metrics.repairCalls += 1
                try:
                    selection = await self._invoke(
                        user_message=user_message,
                        context=normalized_context,
                        repair_reason=last_error,
                    )
                    self.validate_selection(selection, normalized_context)
                    return selection
                except _InvalidActionSelection as error:
                    self.metrics.invalidResponses += 1
                    last_error = (error.reason_code, _bounded_error(error))
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
            if selection.actionId is None:
                raise _InvalidActionSelection(
                    "schema_validation_failed",
                    "Structured Action Selector output failed schema validation.",
                    {"cause": "select_action requires an actionId."},
                )
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
        context: CreatorActionSelectorContext,
        repair_reason: tuple[InvalidActionSelectionReason, str] | None,
    ) -> CreatorActionSelection:
        structured_model = self._get_structured_model()
        messages = self._messages(
            user_message=user_message,
            context=context,
            repair_reason=repair_reason,
        )
        self.metrics.modelCalls += 1
        try:
            if self._structured_model_supplied:
                invocation_model = structured_model
                invocation = lambda current_model: current_model.ainvoke(messages)
            else:
                invocation_model = self._invocation_model
                if invocation_model is None:
                    raise CreatorActionSelectionError(
                        "An Action Selector invocation model is unavailable."
                    )
                invocation = lambda current_model: self._invoke_bound_structured_model(
                    current_model, messages
                )
            result = await self._invocation_reliability.ainvoke(
                invocation_model,
                invocation,
            )
        except CreatorActionSelectionError:
            raise
        except Exception as error:
            raise CreatorActionSelectionError(
                "Creator Action Selector model call failed.",
                {"cause": _bounded_error(error)},
            ) from error

        if isinstance(result, Mapping) and "parsed" in result:
            parsing_error = result.get("parsing_error")
            if parsing_error is not None:
                raise _InvalidActionSelection(
                    "structured_parse_failed",
                    "Structured Action Selector output could not be parsed.",
                    {"cause": _bounded_error(parsing_error)},
                )
            result = result.get("parsed")
        try:
            return (
                result
                if isinstance(result, CreatorActionSelection)
                else CreatorActionSelection.model_validate(result)
            )
        except ValidationError as error:
            raise _InvalidActionSelection(
                "schema_validation_failed",
                "Structured Action Selector output failed schema validation.",
                {"cause": _bounded_error(error)},
            ) from error

    def _get_structured_model(self) -> Any:
        if self._structured_model is not None:
            return self._structured_model
        if self.model is None:
            raise CreatorActionSelectionError(
                "An Action Selector model is unavailable."
            )
        selector_model = self._model_with_selector_budget()
        self._invocation_model = selector_model
        self._structured_model = self._bind_structured_model(selector_model)
        return self._structured_model

    @staticmethod
    def _bind_structured_model(model: Any) -> Any:
        factory = getattr(model, "with_structured_output", None)
        if not callable(factory):
            raise CreatorActionSelectionError(
                "The configured Creator model does not support structured output."
            )
        try:
            return factory(
                CreatorActionSelection,
                include_raw=True,
                method="function_calling",
            )
        except TypeError:
            return factory(CreatorActionSelection, include_raw=True)

    def _invoke_bound_structured_model(
        self, model: Any, messages: list[SystemMessage | HumanMessage]
    ) -> Any:
        structured_model = (
            self._structured_model
            if model is self._invocation_model
            else self._bind_structured_model(model)
        )
        return structured_model.ainvoke(messages)

    async def _recover_invocation_model(self) -> Any:
        if self._recovery_factory is None:
            raise RuntimeError("An Action Selector model recovery factory is unavailable.")
        fresh_model = self._recovery_factory()
        if inspect.isawaitable(fresh_model):
            fresh_model = await fresh_model
        return (
            fresh_model
            if self._structured_model_supplied
            else self._model_with_selector_budget(fresh_model)
        )

    def _model_with_selector_budget(self, model: Any | None = None) -> Any:
        candidate = self.model if model is None else model
        if candidate is None:
            return None
        copier = getattr(candidate, "model_copy", None)
        if not callable(copier):
            return candidate
        try:
            return copier(update={"max_tokens": MAX_ACTION_SELECTOR_OUTPUT_TOKENS})
        except (TypeError, ValueError):
            return candidate

    @staticmethod
    def _messages(
        *,
        user_message: str,
        context: CreatorActionSelectorContext,
        repair_reason: tuple[InvalidActionSelectionReason, str] | None,
    ) -> list[SystemMessage | HumanMessage]:
        payload: dict[str, Any] = {
            "userMessage": user_message,
            "actionSelectorContext": context.model_dump(
                mode="json", exclude_none=True
            ),
        }
        if repair_reason is not None:
            payload["hostValidationFeedback"] = _repair_feedback(
                reason_code=repair_reason[0],
                reason=repair_reason[1],
            )
        return [
            SystemMessage(content=_SELECTOR_SYSTEM_PROMPT),
            HumanMessage(
                content=json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
            ),
        ]
