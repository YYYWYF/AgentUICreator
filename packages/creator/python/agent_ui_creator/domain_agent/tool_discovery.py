"""Progressive tool schemas. Discovery never grants filesystem or mutation authority."""
from __future__ import annotations

import json
from typing import Literal
from collections.abc import Callable

from langchain.agents.middleware import AgentMiddleware
from langchain_core.messages import ToolMessage
from langchain_core.tools import tool

from ..minimal_agent.tool_policy import tool_name
from ..domain_tools import RECOVERY_READ_TOOL_NAMES, RECOVERY_WRITE_TOOL_NAMES
from ..debugging import DEBUGGING_SELECTION_TOOL_NAMES
from ..domain_state import DomainObservationContext

ToolGroup = Literal["composition", "plugin_authoring", "services", "integration", "debugging", "history"]
TOOL_GROUPS = {
    "composition": frozenset({"inspect_app_ui_model", "inspect_app_ui_model_source", "inspect_ui_slots",
        "preflight_ui_plugin_placement", "mutate_app_ui_model", "repair_app_ui_model", "purge_ui_plugin"}),
    "plugin_authoring": frozenset({"list_ui_plugins", "inspect_agent_ui_sources", "apply_agent_ui_source_item",
        "inspect_ui_plugin_source_references", "prepare_ui_plugin_development", "create_ui_plugin",
        "create_custom_plugin", "takeover_plugin_source", "mutate_ui_plugin_source",
        "verify_ui_plugin_behavior", "inspect_ui_plugin_delivery", "prepare_plugin_responsive_repair"}),
    "services": frozenset({"inspect_ui_services", "prepare_ui_service_contract_change",
        "create_ui_service_contract", "mutate_ui_service_contract"}),
    "integration": frozenset({"plan_agent_ui_integration", "verify_agent_ui_integration",
        "apply_agent_ui_integration", "prepare_agent_ui_integration_asset"}),
    "debugging": frozenset({*DEBUGGING_SELECTION_TOOL_NAMES, "inspect_static_diagnostics",
        "inspect_runtime_errors", "inspect_runtime_layout"}),
    "history": frozenset({*RECOVERY_READ_TOOL_NAMES, *RECOVERY_WRITE_TOOL_NAMES}),
}
CORE_TOOLS = frozenset({"ls", "read_file", "glob", "grep", "edit_file", "edit_file_from_read",
    "ask_user_question", "inspect_ui_project", "inspect_app_ui_model", "inspect_ui_plugin", "inspect_ui_capabilities",
    "validate_creator_changes", "enable_creator_tools"})


@tool
def enable_creator_tools(groups: list[ToolGroup]) -> str:
    """Expose needed tool schemas for subsequent calls. Groups: composition (layout, model repair,
    hide/purge); plugin_authoring (source inventory/install, takeover, new Plugins, delivery);
    services (service contracts); integration (Host embedding); debugging (diagnostics/geometry);
    history (transactions/baselines/undo). Select only groups needed by the task. This changes
    model navigation only; read-only, ownership, approval and verification rules still apply.
    """
    return json.dumps({"ok": True, "enabledGroups": sorted(set(groups))})


def create_enable_creator_tools(observations: DomainObservationContext, current_revision: Callable[[], int]):
    @tool("enable_creator_tools", description=enable_creator_tools.description, args_schema=enable_creator_tools.args_schema)
    def discover(groups: list[ToolGroup]) -> str:
        result = {"ok": True, "enabledGroups": sorted(set(groups))}
        if "composition" in groups:
            readiness = observations.app_ui_model_readiness(current_revision=current_revision())
            result["appUIModelObservation"] = readiness
            if not readiness["ready"]:
                result["deferredTools"] = ["mutate_app_ui_model"]
        return json.dumps(result)
    return discover


def enabled_tool_groups(messages) -> set[str]:
    groups: set[str] = set()
    # Completed ToolMessages survive checkpoint resume. User text and proposed
    # AI calls cannot activate groups; availability is still intersected below.
    for message in messages:
        if not isinstance(message, ToolMessage) or message.status == "error":
            continue
        if message.name == "enable_creator_tools":
            try:
                value = json.loads(message.content)
                if value.get("ok") is True:
                    groups.update(group for group in value.get("enabledGroups", []) if group in TOOL_GROUPS)
            except (ValueError, TypeError, AttributeError):
                pass
        elif message.name in {"inspect_ui_project", "inspect_app_ui_model", "inspect_app_ui_model_source"}:
            try:
                value = json.loads(message.content)
                if value.get("ok") is True:
                    # Partial pages reveal inspection tools too, but mutation
                    # visibility is decided by current Host evidence below.
                    groups.add("composition")
            except (ValueError, TypeError, AttributeError):
                pass
    return groups


class ProgressiveToolsMiddleware(AgentMiddleware):
    def __init__(self, observations: DomainObservationContext | None = None,
                 current_revision: Callable[[], int] | None = None):
        self.observations = observations
        self.current_revision = current_revision

    def _request(self, request):
        names = {tool_name(item) for item in request.tools}
        if "enable_creator_tools" not in names:
            # Preserve narrower mandatory lanes (e.g. a pending removal question
            # or invalid-model recovery). Discovery cannot widen their authority.
            return request
        groups = enabled_tool_groups(request.messages)
        allowed = CORE_TOOLS.union(*(TOOL_GROUPS[group] for group in groups))
        if self.observations is not None and self.current_revision is not None:
            if not self.observations.app_ui_model_readiness(current_revision=self.current_revision())["ready"]:
                allowed = allowed - {"mutate_app_ui_model"}
        return request.override(tools=[item for item in request.tools if tool_name(item) in allowed])

    def wrap_model_call(self, request, handler):
        return handler(self._request(request))

    async def awrap_model_call(self, request, handler):
        return await handler(self._request(request))
