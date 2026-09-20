from __future__ import annotations

import json
from collections.abc import Awaitable, Callable, Sequence
from typing import Any

from langchain.agents.middleware import AgentMiddleware, ModelRequest, ModelResponse
from langchain_core.messages import SystemMessage, ToolMessage

from ..domain_state import (
    DomainObservationContext,
    composition_fast_path_error,
    filesystem_source_read_path,
    is_cross_layer_read,
)
from ..minimal_agent.path_policy import PolicyFilesystemBackend
from ..minimal_agent.tool_policy import tool_name
from ..model_protocol.trace import ToolProtocolMetrics
from ..verification_policy import (
    CreatorVerificationMode,
    DEFAULT_CREATOR_VERIFICATION_MODE,
)
from .tool_policy import READ_ONLY_TOOL_NAMES, RUNTIME_VERIFICATION_TOOL_NAMES


COMPOSITION_PRE_MUTATION_TOOL_NAMES = (
    "read_file",
    "inspect_ui_project",
    "mutate_app_ui_model",
    "inspect_runtime_layout",
)
COMPOSITION_POST_MUTATION_TOOL_NAMES = (
    "read_file",
    "inspect_ui_project",
    "mutate_app_ui_model",
    "inspect_runtime_layout",
    "validate_creator_changes",
    "inspect_runtime_errors",
)


COMPOSITION_GROUNDING_CONTROL = """Composition grounding is sufficient.
Authoritative evidence already covers the AppUIModel hash, Layout refs and sizes,
Slots and current instances, available Plugin capability summaries, and Active
Composition. For a pure Composition change, the next side effect should be
mutate_app_ui_model. Do not read Plugin source, CSS, Services, or generated files.
If another authoring layer is genuinely required, issue the smallest targeted
cross-layer read. The Host treats that rejected read as an explicit exit signal
and restores the full tool surface on the next model call; retry the read then.
Expand grounding for a missing decisive fact or another-layer requirement."""


class CompositionGroundingConvergenceMiddleware(AgentMiddleware):
    """Inject execution control while the authoritative Composition snapshot is fresh."""

    def __init__(
        self,
        observations: DomainObservationContext,
        backend: PolicyFilesystemBackend,
        protocol_metrics: ToolProtocolMetrics | None = None,
        verification_mode: CreatorVerificationMode = DEFAULT_CREATOR_VERIFICATION_MODE,
    ) -> None:
        self.observations = observations
        self.backend = backend
        self.protocol_metrics = protocol_metrics or ToolProtocolMetrics()
        self.verification_mode = verification_mode

    @staticmethod
    def _composition_lane_tools(
        tools: Sequence[Any],
        *,
        after_mutation: bool,
        verification_mode: CreatorVerificationMode = DEFAULT_CREATOR_VERIFICATION_MODE,
    ) -> list[Any]:
        allowed_names = frozenset(
            COMPOSITION_POST_MUTATION_TOOL_NAMES
            if after_mutation
            else COMPOSITION_PRE_MUTATION_TOOL_NAMES
        )
        by_name = {
            tool_name(candidate): candidate
            for candidate in tools
            if tool_name(candidate) in allowed_names
        }
        names = (
            COMPOSITION_POST_MUTATION_TOOL_NAMES
            if after_mutation
            else COMPOSITION_PRE_MUTATION_TOOL_NAMES
        )
        if verification_mode == "static_only":
            names = tuple(
                name
                for name in names
                if name not in RUNTIME_VERIFICATION_TOOL_NAMES
            )
        return [by_name[name] for name in names if name in by_name]

    def _request(self, request: ModelRequest) -> ModelRequest:
        current_revision = self.backend.mutation_revision
        status = self.observations.composition_grounding_status(
            current_revision=current_revision
        )
        metrics = self.observations.composition_fast_path_metrics
        successful_mutation_revision = metrics.first_mutation_revision
        post_mutation_revision_change = (
            status == "stale"
            and metrics.firstMutationSucceeded is True
            and successful_mutation_revision == current_revision
        )
        if status != "grounded" and not post_mutation_revision_change:
            return request
        after_mutation = metrics.first_mutation_started
        return request.override(
            messages=[
                *request.messages,
                SystemMessage(content=COMPOSITION_GROUNDING_CONTROL),
            ],
            tools=self._composition_lane_tools(
                request.tools,
                after_mutation=after_mutation,
                verification_mode=self.verification_mode,
            ),
        )

    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelResponse:
        return handler(self._request(request))

    async def awrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], Awaitable[ModelResponse]],
    ) -> ModelResponse:
        return await handler(self._request(request))

    @staticmethod
    def _call(request: object) -> tuple[dict[str, object], str, dict[str, object]]:
        call = dict(getattr(request, "tool_call", {}))
        name = str(call.get("name") or "")
        arguments = call.get("args")
        return call, name, dict(arguments) if isinstance(arguments, dict) else {}

    def _prohibited_message(
        self, call: dict[str, object], name: str
    ) -> ToolMessage:
        return ToolMessage(
            content=json.dumps(
                composition_fast_path_error(),
                ensure_ascii=False,
                separators=(",", ":"),
            ),
            tool_call_id=str(call.get("id") or "composition-fast-path"),
            name=name,
        )

    @staticmethod
    def _filesystem_read_succeeded(result: object) -> bool:
        return getattr(result, "status", None) == "success"

    def _record_tool_observation(
        self,
        name: str,
        arguments: dict[str, object],
        *,
        result: object = None,
        error: BaseException | None = None,
    ) -> None:
        logger = getattr(self.backend.activity, "logger", None)
        if logger is None:
            return
        logger.record_tool_observation(
            model_call_sequence=self.protocol_metrics.modelCalls,
            tool_name=name,
            phase=(
                "after_first_mutation"
                if self.observations.composition_fast_path_metrics.first_mutation_started
                else "before_first_mutation"
            ),
            arguments=arguments,
            result=result,
            error=error,
        )

    def _before_tool_call(
        self, request: object
    ) -> tuple[dict[str, object], str, dict[str, object], bool]:
        call, name, arguments = self._call(request)
        metrics = self.observations.composition_fast_path_metrics
        if name == "mutate_app_ui_model":
            metrics.record_first_mutation_started(
                self.protocol_metrics,
                read_only_tool_names=READ_ONLY_TOOL_NAMES,
            )
        prohibited = (
            self.observations.composition_grounding_status(
                current_revision=self.backend.mutation_revision
            )
            == "grounded"
            and is_cross_layer_read(name, arguments)
        )
        if prohibited:
            metrics.record_cross_layer_read_attempt()
            if filesystem_source_read_path(name, arguments) is not None:
                metrics.record_filesystem_source_read()
            self.observations.clear_composition_grounding(
                reason="cross_layer_read",
                current_revision=self.backend.mutation_revision,
            )
        return call, name, arguments, prohibited

    def _after_tool_call(
        self,
        name: str,
        arguments: dict[str, object],
        result: object,
    ) -> None:
        metrics = self.observations.composition_fast_path_metrics
        if name == "mutate_app_ui_model":
            metrics.record_first_mutation_result(
                result,
                revision=self.backend.mutation_revision,
            )
        elif (
            filesystem_source_read_path(name, arguments) is not None
            and self._filesystem_read_succeeded(result)
        ):
            metrics.record_filesystem_source_read()

    def wrap_tool_call(self, request: object, handler: Callable[[object], object]) -> object:
        call, name, arguments, prohibited = self._before_tool_call(request)
        if prohibited:
            result = self._prohibited_message(call, name)
            self._record_tool_observation(name, arguments, result=result)
            return result
        try:
            result = handler(request)
        except BaseException as error:
            if name == "mutate_app_ui_model":
                self.observations.composition_fast_path_metrics.record_first_mutation_exception(
                    error
                )
            self._record_tool_observation(name, arguments, error=error)
            raise
        self._after_tool_call(name, arguments, result)
        self._record_tool_observation(name, arguments, result=result)
        return result

    async def awrap_tool_call(
        self,
        request: object,
        handler: Callable[[object], Awaitable[object]],
    ) -> object:
        call, name, arguments, prohibited = self._before_tool_call(request)
        if prohibited:
            result = self._prohibited_message(call, name)
            self._record_tool_observation(name, arguments, result=result)
            return result
        try:
            result = await handler(request)
        except BaseException as error:
            if name == "mutate_app_ui_model":
                self.observations.composition_fast_path_metrics.record_first_mutation_exception(
                    error
                )
            self._record_tool_observation(name, arguments, error=error)
            raise
        self._after_tool_call(name, arguments, result)
        self._record_tool_observation(name, arguments, result=result)
        return result
