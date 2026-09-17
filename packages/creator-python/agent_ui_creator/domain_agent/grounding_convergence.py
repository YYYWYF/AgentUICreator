from __future__ import annotations

import json
from collections.abc import Awaitable, Callable

from langchain.agents.middleware import AgentMiddleware, ModelRequest, ModelResponse
from langchain_core.messages import SystemMessage, ToolMessage

from ..domain_state import (
    DomainObservationContext,
    composition_fast_path_error,
    filesystem_source_read_path,
    is_cross_layer_read,
)
from ..minimal_agent.path_policy import PolicyFilesystemBackend
from ..model_protocol.trace import ToolProtocolMetrics
from .tool_policy import READ_ONLY_TOOL_NAMES


COMPOSITION_GROUNDING_CONTROL = """Composition grounding is sufficient.
Authoritative evidence already covers the AppUIModel hash, Layout refs and sizes,
Slots and current instances, available Plugin capability summaries, and Active
Composition. For a pure Composition change, the next side effect should be
mutate_app_ui_model. Do not read Plugin source, CSS, Services, or generated files.
Expand grounding only when the user's desired state is cross-layer or the Host
reports stale state, a missing decisive fact, or another-layer requirement."""


class CompositionGroundingConvergenceMiddleware(AgentMiddleware):
    """Inject execution control while the authoritative Composition snapshot is fresh."""

    def __init__(
        self,
        observations: DomainObservationContext,
        backend: PolicyFilesystemBackend,
        protocol_metrics: ToolProtocolMetrics | None = None,
    ) -> None:
        self.observations = observations
        self.backend = backend
        self.protocol_metrics = protocol_metrics or ToolProtocolMetrics()

    def _request(self, request: ModelRequest) -> ModelRequest:
        if self.observations.composition_grounding_status(
            current_revision=self.backend.mutation_revision
        ) != "grounded":
            return request
        return request.override(
            messages=[
                *request.messages,
                SystemMessage(content=COMPOSITION_GROUNDING_CONTROL),
            ]
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
        return call, name, arguments, prohibited

    def _after_tool_call(
        self,
        name: str,
        arguments: dict[str, object],
        result: object,
    ) -> None:
        metrics = self.observations.composition_fast_path_metrics
        if name == "mutate_app_ui_model":
            metrics.record_first_mutation_result(result)
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
