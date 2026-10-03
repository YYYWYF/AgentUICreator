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
from ..plugin_development.authority import PluginDevelopmentAuthority
from ..verification_policy import (
    CreatorVerificationMode,
    DEFAULT_CREATOR_VERIFICATION_MODE,
)
from .tool_policy import READ_ONLY_TOOL_NAMES, RUNTIME_VERIFICATION_TOOL_NAMES


COMPOSITION_PRE_MUTATION_TOOL_NAMES = (
    "read_file",
    "inspect_ui_project",
    "inspect_agent_ui_sources",
    "inspect_ui_capabilities",
    "inspect_ui_plugin_delivery",
    "prepare_ui_plugin_development",
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
    "inspect_ui_plugin_delivery",
    "verify_ui_plugin_behavior",
)
SOURCE_INSTALLED_TOOL_NAMES = (
    "inspect_ui_project",
    "inspect_ui_capabilities",
    "inspect_ui_plugin",
    "preflight_ui_plugin_placement",
    "prepare_ui_plugin_development",
    "mutate_app_ui_model",
    "inspect_ui_plugin_delivery",
    "validate_creator_changes",
)


COMPOSITION_GROUNDING_CONTROL = """Composition grounding is sufficient.
Authoritative evidence already covers the AppUIModel hash, Layout refs and sizes,
Slots and current instances, available Plugin capability summaries, and Active
Composition. For a pure Composition change, the next side effect should be
mutate_app_ui_model. Do not read Plugin source, CSS, Services, or generated files.
If another authoring layer is genuinely required, issue the smallest targeted
cross-layer read. For a missing reusable capability, inspect_agent_ui_sources
is available and exits the Composition fast path in one read. Other cross-layer
reads are rejected as explicit exit signals; retry them on the next model call.
For an explicit user commission, prepare_ui_plugin_development is available
to bind the development grant and exit this lane. For other requests, inspect
existing Plugins and Source Items before proposing new development.
For conditional development, list_ui_plugins must also complete the installed
Plugin inventory before preparation; a Composition summary does not substitute
for that inventory.
Expand grounding for a missing decisive fact or another-layer requirement."""

COMPOSITION_POST_MUTATION_CONTROL = """The AppUIModel mutation succeeded on the
current revision. If the requested implementation is complete, call
validate_creator_changes now and finish when current-revision validation
passes. Do not browse unrelated source files, Host internals, or Mock scenario
implementations to repeat facts already established. If a decisive requested
change is still missing, use the smallest available targeted read or mutation."""

SOURCE_INSTALLED_CONTROL = """The formal Source Item has been installed for this
task. Its Plugin implementation and registry now exist. Finish the requested
reuse through the public Composition tools: inspect_ui_project(view=composition)
for the current hash, then mutate_app_ui_model to insert that installed Plugin
at its declared placement, and validate_creator_changes on the new revision.
Do not inspect Host, Runtime, or framework source to infer a separate mount path.
If the current user explicitly requested further Plugin development, use
prepare_ui_plugin_development for that distinct authorized work."""


class CompositionGroundingConvergenceMiddleware(AgentMiddleware):
    """Inject execution control while the authoritative Composition snapshot is fresh."""

    def __init__(
        self,
        observations: DomainObservationContext,
        backend: PolicyFilesystemBackend,
        protocol_metrics: ToolProtocolMetrics | None = None,
        verification_mode: CreatorVerificationMode = DEFAULT_CREATOR_VERIFICATION_MODE,
        development_authority: PluginDevelopmentAuthority | None = None,
    ) -> None:
        self.observations = observations
        self.backend = backend
        self.protocol_metrics = protocol_metrics or ToolProtocolMetrics()
        self.verification_mode = verification_mode
        self.development_authority = development_authority

    @staticmethod
    def _composition_lane_tools(
        tools: Sequence[Any],
        *,
        after_mutation: bool,
        verification_mode: CreatorVerificationMode = DEFAULT_CREATOR_VERIFICATION_MODE,
        source_inventory_observed: bool = False,
    ) -> list[Any]:
        source_inventory_tools = (
            {"apply_agent_ui_source_item", "list_ui_plugins"}
            if source_inventory_observed and not after_mutation else set()
        )
        allowed_names = frozenset((
            COMPOSITION_POST_MUTATION_TOOL_NAMES
            if after_mutation
            else COMPOSITION_PRE_MUTATION_TOOL_NAMES
        )) | source_inventory_tools
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
        if source_inventory_observed and not after_mutation:
            names = (*names, "apply_agent_ui_source_item", "list_ui_plugins")
        return [by_name[name] for name in names if name in by_name]

    def _request(self, request: ModelRequest) -> ModelRequest:
        current_revision = self.backend.mutation_revision
        status = self.observations.composition_grounding_status(
            current_revision=current_revision
        )
        metrics = self.observations.composition_fast_path_metrics
        successful_mutation_revision = metrics.latest_successful_mutation_revision
        post_mutation_revision_change = (
            status == "stale"
            and successful_mutation_revision == current_revision
        )
        if (
            self.development_authority is not None
            and self.development_authority.installed_source_plugin_ids
            and not metrics.first_mutation_started
        ):
            allowed = frozenset(SOURCE_INSTALLED_TOOL_NAMES)
            by_name = {tool_name(candidate): candidate for candidate in request.tools
                       if tool_name(candidate) in allowed}
            return request.override(
                messages=[*request.messages, SystemMessage(content=SOURCE_INSTALLED_CONTROL)],
                tools=[by_name[name] for name in SOURCE_INSTALLED_TOOL_NAMES if name in by_name],
            )
        if status != "grounded" and not post_mutation_revision_change:
            return request
        after_mutation = metrics.first_mutation_started
        return request.override(
            messages=[
                *request.messages,
                SystemMessage(content=(
                    COMPOSITION_POST_MUTATION_CONTROL
                    if post_mutation_revision_change
                    else COMPOSITION_GROUNDING_CONTROL
                )),
            ],
            tools=self._composition_lane_tools(
                request.tools,
                after_mutation=after_mutation,
                verification_mode=self.verification_mode,
                source_inventory_observed=self.observations.source_inventory_observed,
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

    @staticmethod
    def _prepare_succeeded(result: object) -> bool:
        try:
            payload = json.loads(getattr(result, "content", ""))
        except (TypeError, ValueError):
            return False
        return isinstance(payload, dict) and payload.get("ok") is True

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
            and is_cross_layer_read(name, arguments, project_root=str(self.backend.cwd))
        )
        if prohibited:
            metrics.record_cross_layer_read_attempt()
            if filesystem_source_read_path(name, arguments, project_root=str(self.backend.cwd)) is not None:
                metrics.record_filesystem_source_read()
            self.observations.clear_composition_grounding(
                reason="cross_layer_read",
                current_revision=self.backend.mutation_revision,
            )
            if name == "inspect_agent_ui_sources":
                prohibited = False
        return call, name, arguments, prohibited

    def _after_tool_call(
        self,
        name: str,
        arguments: dict[str, object],
        result: object,
    ) -> None:
        metrics = self.observations.composition_fast_path_metrics
        if (
            name == "prepare_ui_plugin_development"
            and self._prepare_succeeded(result)
            and self.observations.composition_grounding_status(
                current_revision=self.backend.mutation_revision
            ) == "grounded"
        ):
            self.observations.clear_composition_grounding(
                reason="development_gap",
                current_revision=self.backend.mutation_revision,
            )
        if name == "mutate_app_ui_model":
            metrics.record_first_mutation_result(
                result,
                revision=self.backend.mutation_revision,
            )
        elif (
            filesystem_source_read_path(name, arguments, project_root=str(self.backend.cwd)) is not None
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
