from __future__ import annotations

import inspect
import json
import re
from collections.abc import Callable, Mapping
from time import monotonic
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import ValidationError

from ..model_protocol.reliability import create_creator_model_invocation_reliability
from ..model_settings import DEFAULT_CREATOR_MODEL_MAX_RETRIES
from .models import (
    CreatorActionSelection,
    CreatorActionSelectorMetrics,
    CreatorActionSelectorContext,
    InvalidActionSelectionReason,
)

MAX_ACTION_SELECTOR_REPAIR_CALLS = 1
MAX_ACTION_SELECTOR_OUTPUT_TOKENS = 128
ACTION_SELECTOR_PROTOCOL = "choice-text-v1"

_SELECT_PATTERN = re.compile(r"SELECT (A[1-9][0-9]*)\Z")
_CLARIFY_PATTERN = re.compile(r"CLARIFY ([^\r\n]+)\Z")

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
Use GENERAL only for broader or generative implementation changes, such as
fuzzy search. Use CLARIFY only when the supplied semantics cannot identify one
target without guessing. Use UNSUPPORTED when a simple Product or Composition
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


def _bounded_error(error: BaseException) -> str:
    return str(error).strip()[:500] or error.__class__.__name__


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
    ) -> None:
        if model is None:
            raise ValueError("A model is required.")
        self.model = model
        self._invocation_model = self._model_with_selector_budget(model)
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
            choices = {
                f"A{number}": candidate
                for number, candidate in enumerate(normalized_context.actions, 1)
            }
            prompt_context = _selector_prompt_context(normalized_context)
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
                    response = await self._invoke(
                        user_message=user_message,
                        context=prompt_context,
                        choices=choices,
                        repair_reason=last_error,
                    )
                    selection = _parse_selector_response(response, choices)
                    self.validate_selection(selection, normalized_context)
                    return selection
                except _InvalidActionSelection as error:
                    self.metrics.invalidResponses += 1
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

        return getattr(result, "content", result)

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
            return copier(update={
                "streaming": False,
                "temperature": 0,
                "max_tokens": MAX_ACTION_SELECTOR_OUTPUT_TOKENS,
            })
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
