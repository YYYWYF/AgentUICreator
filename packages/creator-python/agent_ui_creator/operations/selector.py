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
from ..plugin_development.commission import explicitly_commissions_plugin_development
from .models import (
    CreatorActionSelection,
    CreatorActionSelectorMetrics,
    CreatorActionSelectorContext,
    InvalidActionSelectionReason,
)

MAX_ACTION_SELECTOR_REPAIR_CALLS = 1
MAX_INVALID_SELECTOR_PREVIEW_CHARACTERS = 300
ACTION_SELECTOR_PROTOCOL = "intent-route-text-v2"

_SELECT_PATTERN = re.compile(r"SELECT (A[1-9][0-9]*)\Z")
_CLARIFY_PATTERN = re.compile(r"CLARIFY ([^\r\n]+)\Z")
_EXPLICIT_WORKSPACE_REGION = {
    "left": re.compile(
        r"Workspace[. ]Left|左边|左侧|左栏|\bon (?:the )?left\b|\bto (?:the )?left\b",
        re.I,
    ),
    "center": re.compile(
        r"Workspace[. ]Center|中间|中央|\bin (?:the )?center\b|\bto (?:the )?center\b",
        re.I,
    ),
    "right": re.compile(
        r"Workspace[. ]Right|右边|右侧|右栏|\bon (?:the )?right\b|\bto (?:the )?right\b",
        re.I,
    ),
}
_EXPLICIT_WORKSPACE_PLACEMENT = re.compile(
    r"Workspace[. ](?:Left|Center|Right)"
    r"|(?:左|中|右)(?:边|侧|栏)\s*(?:的\s*)?Workspace\s*(?:面板|区域|栏)?"
    r"|(?:左|中|右)(?:边|侧|栏)(?:面板|区域|栏)"
    r"|\b(?:left|center|right)\s+(?:Workspace\s+)?(?:panel|region|column)\b",
    re.I,
)
_EXPLICIT_RELATIVE_PLACEMENT = re.compile(
    r"\bbefore\b|\bafter\b|\babove\b|\bbelow\b|\bnext to\b|前面|后面|上方|下方|之前|之后",
    re.I,
)
_PRESERVE_PLUGIN_SOURCE = re.compile(
    r"(?:保留|不(?:要|再)?(?:修改|改动|删除|触碰))\s*(?:UI\s*)?(?:Plugin|插件)?(?:的)?\s*(?:源代码|源码|实现)"
    r"|\b(?:leave|keep)\s+(?:the\s+)?(?:plugin\s+)?(?:source|implementation)\s+(?:unchanged|intact)\b"
    r"|\bdo\s+not\s+(?:modify|change|delete)\s+(?:the\s+)?(?:plugin\s+)?(?:source|implementation)\b",
    re.I,
)
_RESTORE_PLUGIN_SOURCE = re.compile(
    r"(?:恢复|还原)\s*(?:此前|之前|原有|原始)?\s*(?:UI\s*)?(?:Plugin|插件)?(?:的)?\s*(?:源代码|源码|实现)"
    r"|\brestore\s+(?:the\s+)?(?:plugin\s+)?(?:source|implementation)\b",
    re.I,
)
_RESTORE_VISUAL_STATE = re.compile(
    r"恢复|还原|重新显示|显示回来|\brestore\b|\bshow\s+again\b|\bbring\s+back\b",
    re.I,
)
_SHOW_DEFAULT_VISUAL_STATE = re.compile(
    r"(?:显示出来|显示回来|重新显示|恢复显示|启用|打开)"
    r"|\b(?:show|enable|turn\s+on|bring\s+back)\b",
    re.I,
)
_PRESERVE_DEFAULT_PRESENTATION = re.compile(
    r"(?:保持|沿用|使用|保留).{0,24}(?:默认|现有|当前).{0,12}(?:展示|样式|外观|呈现)"
    r"|\b(?:keep|use|preserve).{0,40}(?:default|existing|current).{0,24}(?:presentation|style|appearance)\b",
    re.I,
)
_CONDITIONAL_DEVELOPMENT_COMMISSION = re.compile(
    r"(?:没有|不存在|找不到|无现成|做不到|否则|不行的话).{0,40}"
    r"(?:开发|新建|创建|实现|做一个|写一个)"
    r"|\b(?:if|unless|otherwise)\b.{0,90}"
    r"\b(?:build|develop|create|implement)\b",
    re.I,
)
_ORIGINAL_VISUAL_STATE = re.compile(
    r"原来|原有|原位置|之前|此前|\b(?:original|previous|prior)\b",
    re.I,
)


def _explicit_workspace_region(message: str) -> str | None:
    matches = [
        region
        for region, pattern in _EXPLICIT_WORKSPACE_REGION.items()
        if pattern.search(message)
    ]
    return matches[0] if len(matches) == 1 else None

_SELECTOR_SYSTEM_PROMPT = """You are the Creator Intent Selector.

For Agent UI integration into the current Host: a how-to guide needs current
Host facts, so choose READ_ONLY INSPECT (integration_guide). A request to apply
integration chooses MODIFY GENERAL. A request to prepare only the compiled
resource/asset file also chooses MODIFY GENERAL; it is not a read-only guide. A request to check manual integration chooses
READ_ONLY INSPECT. Do not route these requests to a Plugin development decision
or a Composer/Layout action. The general agent consumes Host Integration Recipes.


The Host has already determined the currently valid Composition Actions and
Authoring Targets. You only select one supplied choice; you do not construct
operations, invent ownership, or execute changes.
Recent conversation is bounded navigation context for resolving follow-up
references. Current Host choices and fresh workspace observations remain the
authority; never treat prior file content as current.

Return exactly ONE line: <task intent> <route>. Task intent is MODIFY when
the user's requested final result changes the project, and READ_ONLY when the
requested final result is only an answer or inspection. Use READ_ONLY_EXPLICIT
when the current user explicitly forbids modifying the project. Routes are SELECT A<n>,
ANSWER, INSPECT, GENERAL, GENERAL DEVELOPMENT_DECISION,
GENERAL DEVELOPMENT_EXPLICIT, GENERAL DEVELOPMENT_CONDITIONAL,
GENERAL DEVELOPMENT_PROHIBITED, GENERAL HIDE, GENERAL PURGE, GENERAL REMOVAL_UNCERTAIN, UNSUPPORTED, or CLARIFY <question>.
Examples: MODIFY GENERAL; READ_ONLY INSPECT; READ_ONLY_EXPLICIT INSPECT;
MODIFY SELECT A1.
Determine task intent from the final deliverable before choosing a route.
Inspection needed before editing, an unidentified target, or no matching atomic
Action never turns a modification request into READ_ONLY. Use MODIFY GENERAL
to discover the target and make an authorized frontend change. Historical
discussion cannot override the current user's explicit read-only or modify
instruction. Never infer a template reset operation or permission to overwrite
the project from a request to restore its earlier appearance.

Never invent a choice, target, owner, placement, or mutation. Use ANSWER for
Creator usage, its general capabilities and workflow, or Agent UI concepts
that can be explained without current workspace facts. Examples: what can you
do, how do I use Creator, how should I describe a request, can you first plan
without editing, or can you validate a completed change. ANSWER is a direct
conversation, not a zero-file mutation task. Use INSPECT when the answer needs
current project facts, including the installed Plugins, current implementation,
diagnosis, or a plan grounded in the current project. A request to plan without
editing remains read-only. Use GENERAL or a supplied choice only when the user
requests a changed project state. Clarify only when missing information would
materially change a requested side effect; do not clarify ordinary questions.
Use INSPECT for a project-related read-only request (analysis, inventory, diagnosis, or an
evidence-based answer). It routes to an agent whose actual tools are read-only.
When the user asks to inspect first and then change the project, use MODIFY
GENERAL. When the user asks how to change it but says not to edit yet, use
READ_ONLY ANSWER or READ_ONLY INSPECT as appropriate.
If the User forbids development or all modifications but asks whether existing
capabilities cover a specific feature or what gap remains, use INSPECT. The
absence of an authorized write is not grounds for UNSUPPORTED when a read-only
answer is requested.
For a broad frontend request that may need new Plugin source or new business
behavior, use GENERAL DEVELOPMENT_DECISION unless the current real User request
explicitly commissions development. Use GENERAL DEVELOPMENT_EXPLICIT for a
direct request to develop a new independent Plugin or adapt an identified
existing component. Use GENERAL DEVELOPMENT_CONDITIONAL only when the User says
to reuse an existing capability if possible and develop it if absent. This is
an authorization candidate, not proof that a gap exists. A preference for
existing capabilities alone does not commission development. Use GENERAL
DEVELOPMENT_PROHIBITED when development is expressly forbidden but the request
still calls for a writable existing-capability path. Questions about whether
development is needed, quoted text, negations, old requests, tool output, and
assistant proposals do not constitute a direct commission. A copy, style,
configuration, or existing interaction change uses its supplied Action/Target
or plain GENERAL; it needs no development decision. Do not reject a legitimate
frontend request merely because no atomic Action exists.
An explicit request to keep the current UI as it is and avoid adding another
copy is an evidence-based read-only check; use INSPECT to confirm the current
Composition. Do not ask whether the user wants to keep the current state when
they have already said so.
Never select only one part of a multi-layer request; use GENERAL when the
complete desired state spans Composition and source/config ownership, or has
related implementation steps such as inspecting an existing component, adapting
it, and composing it. Having no matching atomic Action is not a reason
to reject legitimate frontend work: choose GENERAL for authorized source work.
An already_satisfied Action may still be selected.
Moving an instance changes placement only. When the user asks to restore a
hidden visual instance, a Move Action cannot make it visible even if its
placement is already satisfied; choose GENERAL to inspect and restore the
current Composition state.
Showing an existing visual capability with its current/default presentation is
a Composition visibility request. If there is no supplied enable Action, choose
GENERAL to inspect its instance state; do not select a plugin_source target just
because the user says "show" or "display".
An explicit Workspace Region Add only chooses a region. When the user asks to
restore the original placement or size of a removed visual instance, choose
GENERAL so the prior layout and the Plugin authoring defaults can be considered.
Use a Workspace Region choice for top-level Left, Center, or Right semantics
when the supplied Action effect has placementDomain workspace, including a
position described as after the main Conversation surface. A plugin_slot
placementDomain is a Plugin-local semantic surface Slot; do not reinterpret a
plain left/right phrase as Workspace placement when the supplied Action
description identifies such a Slot. Use a relative choice for a genuinely
anchor-specific, non-Workspace placement. An explicit user placement takes
precedence over a Plugin defaultPlacement. For workspace placement, choose
add_default only when the user did not request a location; a canonical
plugin_slot control may still be selected for a plain directional phrase when
its supplied semantic description matches that control. If an exact requested
placement is unavailable, return GENERAL or CLARIFY; never select another
placement or add_default as a fallback.
Plugin removal has two outcomes, determined semantically from the user's final
result, current Plugin context and recent clarification. Do not select ordinary
visual Remove Actions as a final user outcome. Explicit hiding, disabling or
keeping the implementation for later restoration means hide: return MODIFY GENERAL
HIDE. Explicit permanent deletion, uninstalling or deleting source means purge:
return MODIFY GENERAL PURGE. Uncertain removal such as “把 Slash Command 去掉”
means uncertain: return MODIFY GENERAL REMOVAL_UNCERTAIN. This asks the user to
choose 隐藏（保留插件源码，之后可以恢复） or 彻底删除（删除插件及不再需要的相关源码）
before writes. “先把 Slash Command 隐藏掉” means hide; “彻底删除 Slash Command，
源码也不要” means purge. Host owns cleanup; never construct file or Provider lists.
A brief answer to the previous clarification resolves the choice using context.
Select an application_config or plugin_source choice when the requested change
is a supplied, scoped authoring target. Use GENERAL for broader or unscoped
implementation changes, such as a new capability with no supplied owner. Use
GENERAL when the user explicitly preserves Plugin source but a plugin_source
choice appears relevant; inspect Composition and preserve currently authorized source changes.
Only restore earlier source when the user explicitly requests restoration, or
when a change introduced in this run is proven to violate the authorized request.
Hiding a current visual instance while
preserving its implementation is a Composition change.
When restoring Plugin source and changing Composition are both requested,
choose GENERAL so both changes are handled together.
For a current-screen-only hide that preserves Plugin source, choose GENERAL
instead of a Remove Action: the instance can be disabled in Composition.
CLARIFY only when a user-owned business decision materially changes the result
and project inspection cannot resolve it; ordinary implementation choices
belong to Creator. Use UNSUPPORTED only for a request clearly outside Agent
frontend product scope or a forbidden authorization boundary, not for an empty
candidate list or a compound but related task. Return no JSON, Markdown, or
explanation.

Semantic highways:
- Composition: add or remove a Plugin, Plugin existence, enable or disable,
  placement, Layout, or Slot membership.
- Application Config: product content, copy, starter prompts, welcome content,
  application defaults, or runtime defaults.
- Plugin Source: rendering, styling, interaction, behavior, or implementation.
Use the supplied candidate kind to route these semantics; the model still
returns only SELECT A<n>.
When returning CLARIFY, write the question in Simplified Chinese by default;
preserve established technical terms, product names, and identifiers.
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
    if reason_code == "intent_route_conflict":
        return (
            "Your task intent and route contradict each other. Re-read the ORIGINAL "
            "user request and decide whether its final result changes the project. "
            "Inspection before a requested edit is MODIFY GENERAL. An explicit "
            "request to leave the project unchanged is READ_ONLY_EXPLICIT INSPECT or "
            "READ_ONLY_EXPLICIT ANSWER. Return one corrected <task intent> <route> line."
        )
    if reason_code == "unknown_choice_key":
        return (
            "Your previous SELECT referenced a choice that does not exist in the "
            "current request.\n\n"
            f"Select exactly one of: {valid}.\n"
            "Return MODIFY SELECT <valid-choice>, or use an intent and ANSWER / INSPECT / GENERAL / GENERAL DEVELOPMENT_DECISION / GENERAL DEVELOPMENT_EXPLICIT / GENERAL DEVELOPMENT_CONDITIONAL / GENERAL DEVELOPMENT_PROHIBITED / UNSUPPORTED / "
            "CLARIFY if semantically correct.\n"
            "Do not reinterpret the user's request."
        )
    return (
        "Your previous response did not match the Creator Action Selector protocol.\n\n"
        "Return exactly ONE line: MODIFY, READ_ONLY, or READ_ONLY_EXPLICIT followed by one route:\n"
        "SELECT <choice>\nANSWER\nINSPECT\nGENERAL\nGENERAL DEVELOPMENT_DECISION\nGENERAL DEVELOPMENT_EXPLICIT\nGENERAL DEVELOPMENT_CONDITIONAL\nGENERAL DEVELOPMENT_PROHIBITED\nGENERAL HIDE\nGENERAL PURGE\nGENERAL REMOVAL_UNCERTAIN\nUNSUPPORTED\nCLARIFY <question>\n\n"
        "When using CLARIFY, write the question in Simplified Chinese by default.\n"
        f"Valid choices are: {valid}.\n"
        "Do not return JSON, Markdown, or explanation.\n"
        "Do not reinterpret the user's request."
    )


def _selector_prompt_context(context: CreatorActionSelectorContext) -> dict[str, object]:
    if context.intentCatalog is not None:
        choices = [
            {
                "choice": f"A{number}",
                **candidate.model_dump(mode="json", exclude_none=True),
            }
            for number, candidate in enumerate(context.intentCatalog.candidates, 1)
        ]
    else:
        choices = [
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
        ]
    return {
        "choices": choices,
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
    if line.startswith("MODIFY "):
        return _parse_route_response(line[len("MODIFY "):], choices).model_copy(
            update={"taskIntent": "modify"}
        )
    if line.startswith("READ_ONLY "):
        return _parse_route_response(line[len("READ_ONLY "):], choices).model_copy(
            update={"taskIntent": "read_only"}
        )
    if line.startswith("READ_ONLY_EXPLICIT "):
        return _parse_route_response(line[len("READ_ONLY_EXPLICIT "):], choices).model_copy(
            update={"taskIntent": "read_only", "explicitReadOnly": True}
        )
    raise _InvalidActionSelection(
        "protocol_parse_failed", "Selector response must include a task intent."
    )


def _parse_route_response(
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
        if getattr(candidate, "actionId", None) is not None:
            return CreatorActionSelection(decision="select_action", actionId=candidate.actionId)
        if getattr(candidate, "type", None) == "composition_action":
            return CreatorActionSelection(
                decision="select_action", actionId=candidate.action.actionId
            )
        target = getattr(candidate, "target", None)
        target_id = getattr(target, "targetId", None)
        if target_id is None:
            raise _InvalidActionSelection(
                "protocol_parse_failed",
                "The selected authoring choice has no target id.",
            )
        return CreatorActionSelection(decision="select_intent", targetId=target_id)
    if line in {"GENERAL HIDE", "GENERAL PURGE"}:
        return CreatorActionSelection(decision="general_change", removalIntent=(
            "hide" if line == "GENERAL HIDE" else "purge"))
    if line == "GENERAL REMOVAL_UNCERTAIN":
        return CreatorActionSelection(decision="needs_clarification", removalIntent="uncertain",
            clarificationQuestion="你希望隐藏（保留插件源码，之后可以恢复），还是彻底删除（从项目删除插件及不再需要的相关源码，以后需重新安装或创建）？")
    if line == "GENERAL":
        return CreatorActionSelection(decision="general_change")
    development_intents = {
        "GENERAL DEVELOPMENT_DECISION": "needs_decision",
        "GENERAL DEVELOPMENT_EXPLICIT": "explicit",
        "GENERAL DEVELOPMENT_CONDITIONAL": "conditional",
        "GENERAL DEVELOPMENT_PROHIBITED": "prohibited",
    }
    if line in development_intents:
        return CreatorActionSelection(
            decision="general_change", developmentIntent=development_intents[line]
        )
    if line == "ANSWER":
        return CreatorActionSelection(decision="answer_only")
    if line == "INSPECT":
        return CreatorActionSelection(decision="read_only_analysis")
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


class CreatorIntentSelector:
    """Select one exact Host-supplied composition action or authoring target."""

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

    def _general_adjustment(self, selection: CreatorActionSelection) -> CreatorActionSelection:
        self.metrics.routeAdjustmentReason = "selected_choice_requires_general_handoff"
        return CreatorActionSelection(
            decision="general_change", taskIntent=selection.taskIntent,
            developmentIntent=selection.developmentIntent,
        )

    async def select(
        self,
        user_message: str,
        context: CreatorActionSelectorContext | Mapping[str, Any],
        *,
        clarification_context: Mapping[str, str] | None = None,
        recent_conversation: list[dict[str, str]] | None = None,
        route_review_context: str | None = None,
    ) -> CreatorActionSelection:
        started_at = monotonic()
        try:
            if not isinstance(user_message, str) or not user_message.strip():
                raise CreatorActionSelectionError(
                    "The original user message must be a non-empty string."
                )
            normalized_context = _coerce_context(context)
            intent_candidates = (
                normalized_context.intentCatalog.candidates
                if normalized_context.intentCatalog is not None
                else normalized_context.actions
            )
            choices = {
                f"A{number}": candidate
                for number, candidate in enumerate(intent_candidates, 1)
            }
            prompt_context = _selector_prompt_context(normalized_context)
            if clarification_context is not None:
                prompt_context["recentClarification"] = dict(clarification_context)
            if recent_conversation:
                prompt_context["recentConversation"] = recent_conversation
            if route_review_context is not None:
                prompt_context["routeReview"] = {
                    "executionAgentReport": route_review_context[:500],
                    "instruction": "Reassess the original user's final result. A reviewed modification may use GENERAL or a supplied SELECT choice; Host authorization precedes execution. Explicit read-only instructions remain read-only.",
                }
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
                    self.metrics.rawVisibleChoice = (
                        response.text[:MAX_INVALID_SELECTOR_PREVIEW_CHARACTERS]
                        if isinstance(response.text, str) else None
                    )
                    selection = _parse_selector_response(response.text, choices)
                    self.metrics.parsedSelection = selection.model_dump(mode="json")
                    self.validate_selection(selection, normalized_context)
                    if (selection.decision == "general_change"
                            and selection.developmentIntent == "explicit"
                            and not explicitly_commissions_plugin_development(user_message)):
                        self.metrics.routeAdjustmentReason = "development_commission_not_confirmed"
                        return selection.model_copy(update={"developmentIntent": "needs_decision"})
                    if (selection.decision == "general_change"
                            and selection.developmentIntent == "conditional"
                            and not _CONDITIONAL_DEVELOPMENT_COMMISSION.search(user_message)):
                        self.metrics.routeAdjustmentReason = "conditional_development_not_confirmed"
                        return selection.model_copy(update={"developmentIntent": "needs_decision"})
                    if (selection.decision in {"select_action", "select_intent"}
                            and _RESTORE_PLUGIN_SOURCE.search(user_message)):
                        return self._general_adjustment(selection)
                    if selection.decision == "select_intent" and _PRESERVE_PLUGIN_SOURCE.search(user_message):
                        selected_intent = next(
                            (candidate for candidate in intent_candidates
                             if getattr(getattr(candidate, "target", None), "targetId", None) == selection.targetId),
                            None,
                        )
                        if getattr(selected_intent, "type", None) == "plugin_source":
                            return self._general_adjustment(selection)
                    if (selection.decision == "select_intent"
                            and _SHOW_DEFAULT_VISUAL_STATE.search(user_message)
                            and _PRESERVE_DEFAULT_PRESENTATION.search(user_message)):
                        selected_intent = next(
                            (candidate for candidate in intent_candidates
                             if getattr(getattr(candidate, "target", None), "targetId", None) == selection.targetId),
                            None,
                        )
                        if getattr(selected_intent, "type", None) == "plugin_source":
                            return self._general_adjustment(selection)
                    if selection.decision == "select_action":
                        selected = next(
                            candidate
                            for candidate in normalized_context.actions
                            if candidate.actionId == selection.actionId
                        )
                        if (selected.kind == "move_plugin"
                                and _RESTORE_VISUAL_STATE.search(user_message)):
                            return self._general_adjustment(selection)
                        if (selected.kind == "add_existing_plugin"
                                and selected.effect.type == "workspace_region"
                                and _RESTORE_VISUAL_STATE.search(user_message)
                                and _ORIGINAL_VISUAL_STATE.search(user_message)):
                            return self._general_adjustment(selection)
                        if selected.kind == "remove_plugin":
                            raise _InvalidActionSelection("protocol_parse_failed",
                                "Remove Actions are internal. Return GENERAL HIDE, GENERAL PURGE, or GENERAL REMOVAL_UNCERTAIN according to the user intent.")
                        requested_region = _explicit_workspace_region(user_message)
                        if selected.kind == "add_existing_plugin" and requested_region is not None:
                            if selected.effect.type == "workspace_region":
                                if selected.effect.region != requested_region:
                                    return self._general_adjustment(selection)
                            elif selected.effect.type == "add_default":
                                placement_domain = selected.effect.placementDomain
                                explicit_workspace = _EXPLICIT_WORKSPACE_PLACEMENT.search(
                                    user_message
                                ) is not None
                                region_word = {"left": "左", "center": "中", "right": "右"}[
                                    requested_region
                                ]
                                described_region = re.search(
                                    rf"\b{requested_region}\b|{region_word}",
                                    selected.description,
                                    re.I,
                                ) is not None
                                if (explicit_workspace or placement_domain != "plugin_slot"
                                        or not described_region):
                                    return self._general_adjustment(selection)
                            else:
                                return self._general_adjustment(selection)
                        if (
                            selected.kind == "add_existing_plugin"
                            and selected.effect.type == "add_default"
                            and _EXPLICIT_RELATIVE_PLACEMENT.search(user_message)
                        ):
                            return self._general_adjustment(selection)
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
            self.metrics.durationMs += max(0, round((monotonic() - started_at) * 1_000))

    @staticmethod
    def validate_selection(
        selection: CreatorActionSelection,
        context: CreatorActionSelectorContext | Mapping[str, Any],
    ) -> None:
        normalized_context = _coerce_context(context)
        if selection.taskIntent == "unknown":
            raise _InvalidActionSelection(
                "protocol_parse_failed", "Selector selection must include a task intent."
            )
        if selection.taskIntent == "modify" and selection.decision in {
            "answer_only", "read_only_analysis"
        } or selection.taskIntent == "read_only" and selection.decision in {
            "select_action", "select_intent", "general_change"
        }:
            raise _InvalidActionSelection(
                "intent_route_conflict",
                "The task's final-result intent conflicts with the selected route.",
                {"taskIntent": selection.taskIntent, "decision": selection.decision},
            )
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
        elif selection.decision == "select_intent":
            intent_catalog = normalized_context.intentCatalog
            target_ids = (
                [candidate.target.targetId for candidate in intent_catalog.candidates
                 if candidate.type != "composition_action" and candidate.target is not None]
                if intent_catalog is not None
                else []
            )
            if selection.targetId not in set(target_ids):
                details = {
                    "returnedTargetId": selection.targetId,
                    "candidateCount": len(target_ids),
                }
                if len(target_ids) <= 32:
                    details["candidateTargetIds"] = target_ids
                else:
                    details["candidateIdsTruncated"] = True
                raise _InvalidActionSelection(
                    "unknown_action_id",
                    "The selected targetId is not one of the supplied Authoring Targets.",
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


# Preserve the existing import surface while making the model-facing selector
# explicitly cover both composition actions and authoring targets.
CreatorActionSelector = CreatorIntentSelector
