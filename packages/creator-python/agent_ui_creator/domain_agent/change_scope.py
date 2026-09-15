from __future__ import annotations

import json
from collections.abc import Awaitable, Callable, Mapping, Sequence
from dataclasses import asdict, dataclass, field
from pathlib import PurePosixPath
from typing import Any, Literal

from langchain.agents.middleware import AgentMiddleware, ModelRequest, ModelResponse
from langchain_core.messages import ToolMessage

from ..minimal_agent.tool_policy import tool_name


ChangeLayer = Literal[
    "composition",
    "plugin_behavior",
    "runtime_capability",
    "agent_integration",
]

_PROJECT_CONTROL_READ_OPERATIONS = frozenset(
    {
        "inspect_ui_project",
        "inspect_app_ui_model",
        "list_ui_plugins",
        "inspect_ui_slots",
        "inspect_ui_plugin",
        "inspect_ui_services",
        "inspect_ui_plugin_source_references",
        "inspect_agent_ui_sources",
    }
)

_STATIC_SIDE_EFFECT_LAYERS: dict[str, ChangeLayer] = {
    "mutate_app_ui_model": "composition",
    "create_ui_plugin": "plugin_behavior",
    "mutate_ui_plugin_source": "plugin_behavior",
    "apply_agent_ui_source_item": "plugin_behavior",
    "prepare_ui_service_contract_change": "runtime_capability",
    "create_ui_service_contract": "runtime_capability",
    "mutate_ui_service_contract": "runtime_capability",
}


def normalize_creator_path(value: str) -> str:
    path = value if value.startswith("/") else f"/{value}"
    return "/" + "/".join(part for part in PurePosixPath(path).parts if part != "/")


def change_layer_for_path(path: str) -> ChangeLayer | None:
    normalized = normalize_creator_path(path)
    if normalized in {"/app-ui/app-ui.json", "/plugins/registry.generated.ts"}:
        return "composition"
    if normalized.startswith("/plugins/") or normalized.startswith("/agent-ui/"):
        return "plugin_behavior"
    if normalized.startswith("/services/"):
        return "runtime_capability"
    if normalized.startswith("/agent-contract/"):
        return "agent_integration"
    return None


def change_layer_for_tool_call(name: str, arguments: Mapping[str, Any]) -> ChangeLayer | None:
    if name == "edit_file":
        path = arguments.get("file_path")
        return change_layer_for_path(path) if isinstance(path, str) else None
    return _STATIC_SIDE_EFFECT_LAYERS.get(name)


def change_layers_for_paths(paths: Sequence[str]) -> tuple[ChangeLayer, ...]:
    layers: list[ChangeLayer] = []
    for path in paths:
        layer = change_layer_for_path(path)
        if layer is not None and layer not in layers:
            layers.append(layer)
    return tuple(layers)


def runtime_failure_layers(result: Mapping[str, Any]) -> tuple[ChangeLayer, ...]:
    layers: list[ChangeLayer] = []
    kind_layers: dict[str, ChangeLayer] = {
        "plugin-width-incompatible": "composition",
        "plugin-render": "plugin_behavior",
        "plugin-activation": "plugin_behavior",
        "application-gate": "runtime_capability",
        "application-event-unknown": "agent_integration",
        "application-event-invalid-payload": "agent_integration",
        "plugin-event-undeclared-subscription": "agent_integration",
        "plugin-event-handler-error": "plugin_behavior",
    }
    for error in result.get("currentErrors", []):
        if not isinstance(error, Mapping):
            continue
        layer = kind_layers.get(str(error.get("kind") or ""))
        if layer is not None and layer not in layers:
            layers.append(layer)
    if any(
        isinstance(check, Mapping) and check.get("status") != "passed"
        for check in result.get("compositionChecks", [])
    ):
        if "runtime_capability" not in layers:
            layers.append("runtime_capability")
    return tuple(layers)


@dataclass(slots=True)
class ChangeScopeMetrics:
    taskChangeLayers: list[ChangeLayer] = field(default_factory=list)
    skillsLoaded: list[str] = field(default_factory=list)
    crossLayerTransitionCount: int = 0
    blockedCrossLayerRepairAttempts: int = 0
    workspaceIntegrityBlockers: int = 0
    _lastLayer: ChangeLayer | None = field(default=None, init=False, repr=False)

    def record_layer(self, layer: ChangeLayer) -> None:
        if self._lastLayer is not None and self._lastLayer != layer:
            self.crossLayerTransitionCount += 1
        if layer not in self.taskChangeLayers:
            self.taskChangeLayers.append(layer)
        self._lastLayer = layer

    def record_skill(self, name: str) -> None:
        if name not in self.skillsLoaded:
            self.skillsLoaded.append(name)

    def to_dict(self) -> dict[str, object]:
        value = asdict(self)
        value.pop("_lastLayer", None)
        return value


class ScopeAwareRecoveryGuard(AgentMiddleware):
    """Keep failures from authorizing repair outside the current task scope."""

    def __init__(self) -> None:
        self.metrics = ChangeScopeMetrics()
        self._blocked_layers: frozenset[ChangeLayer] | None = None
        self._blocker: dict[str, object] | None = None

    @staticmethod
    def _call(request: Any) -> tuple[dict[str, Any], str, dict[str, Any]]:
        call = dict(request.tool_call)
        name = str(call.get("name") or "")
        arguments = call.get("args") if isinstance(call.get("args"), dict) else {}
        return call, name, arguments

    @staticmethod
    def _content(result: Any) -> str:
        content = getattr(result, "content", result)
        return content if isinstance(content, str) else str(content)

    @staticmethod
    def _json_object(content: str) -> dict[str, Any] | None:
        try:
            value = json.loads(content)
        except (TypeError, ValueError):
            return None
        return value if isinstance(value, dict) else None

    def _preserve_scope(
        self, evidence: dict[str, object], *, workspace_integrity: bool
    ) -> None:
        layers = frozenset(self.metrics.taskChangeLayers)
        self._blocked_layers = layers or frozenset({"composition"})
        self._blocker = evidence
        if workspace_integrity:
            self.metrics.workspaceIntegrityBlockers += 1

    def _activate_blocker(self, evidence: dict[str, object]) -> None:
        self._preserve_scope(evidence, workspace_integrity=True)

    def _observe_result(self, name: str, arguments: dict[str, Any], result: Any) -> None:
        if name == "read_file":
            path = arguments.get("file_path")
            if isinstance(path, str):
                parts = PurePosixPath(path).parts
                if len(parts) >= 3 and parts[-1] == "SKILL.md" and "skills" in parts:
                    skill_index = parts.index("skills")
                    if skill_index + 1 < len(parts):
                        self.metrics.record_skill(parts[skill_index + 1])

        payload = self._json_object(self._content(result))
        if payload is None:
            return
        if name == "mutate_app_ui_model":
            error = payload.get("error")
            if isinstance(error, dict) and error.get("category") == "workspace_integrity":
                self._activate_blocker(
                    {
                        "source": name,
                        "code": str(error.get("code") or "WORKSPACE_INTEGRITY"),
                    }
                )
        elif name == "validate_creator_changes":
            result_value = payload.get("result")
            semantics = (
                result_value.get("failureSemantics")
                if isinstance(result_value, dict)
                else None
            )
            if (
                isinstance(semantics, dict)
                and semantics.get("category") == "workspace_integrity"
                and semantics.get("automaticRepairAllowed") is False
            ):
                self._activate_blocker(
                    {"source": name, "attribution": semantics.get("attribution")}
                )
        elif name == "inspect_runtime_errors":
            result_value = payload.get("result")
            if (
                isinstance(result_value, dict)
                and result_value.get("runtimeStatus") == "failed"
                and self.metrics.taskChangeLayers == ["composition"]
            ):
                failure_layers = runtime_failure_layers(result_value)
                outside_composition = not failure_layers or any(
                    layer != "composition" for layer in failure_layers
                )
                self._preserve_scope(
                    {
                        "source": name,
                        "attribution": (
                            "outside_composition"
                            if outside_composition
                            else "in_scope"
                        ),
                        "failureLayers": list(failure_layers),
                    },
                    workspace_integrity=outside_composition,
                )

    def _is_cross_layer_blocked(self, layer: ChangeLayer | None) -> bool:
        return (
            layer is not None
            and self._blocked_layers is not None
            and layer not in self._blocked_layers
        )

    def _blocked_message(self, call: dict[str, Any], layer: ChangeLayer) -> ToolMessage:
        self.metrics.blockedCrossLayerRepairAttempts += 1
        content = json.dumps(
            {
                "ok": False,
                "error": {
                    "code": "CROSS_LAYER_REPAIR_PROHIBITED",
                    "category": "workspace_integrity",
                    "message": (
                        "The current task-scope boundary does not authorize "
                        f"automatic repair in the {layer} layer. Stop and report the blocker."
                    ),
                    "stateChanged": False,
                    "observationStillValid": True,
                    "details": {"blocker": self._blocker},
                    "recovery": {
                        "action": "stop_and_report_blocker",
                        "automaticCrossLayerRepairAllowed": False,
                    },
                },
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
        return ToolMessage(
            content=content,
            tool_call_id=str(call.get("id") or "scope-guard"),
            name=str(call.get("name") or ""),
        )

    def _filter_tools(self, tools: Sequence[Any]) -> list[Any]:
        if self._blocked_layers is None:
            return list(tools)
        return [
            candidate
            for candidate in tools
            if not self._is_cross_layer_blocked(
                _STATIC_SIDE_EFFECT_LAYERS.get(tool_name(candidate))
            )
        ]

    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelResponse:
        return handler(request.override(tools=self._filter_tools(request.tools)))

    async def awrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], Awaitable[ModelResponse]],
    ) -> ModelResponse:
        return await handler(request.override(tools=self._filter_tools(request.tools)))

    def wrap_tool_call(self, request: Any, handler: Callable[[Any], Any]) -> Any:
        call, name, arguments = self._call(request)
        layer = change_layer_for_tool_call(name, arguments)
        if self._is_cross_layer_blocked(layer):
            return self._blocked_message(call, layer)
        if layer is not None:
            self.metrics.record_layer(layer)
        result = handler(request)
        self._observe_result(name, arguments, result)
        return result

    async def awrap_tool_call(
        self, request: Any, handler: Callable[[Any], Awaitable[Any]]
    ) -> Any:
        call, name, arguments = self._call(request)
        layer = change_layer_for_tool_call(name, arguments)
        if self._is_cross_layer_blocked(layer):
            return self._blocked_message(call, layer)
        if layer is not None:
            self.metrics.record_layer(layer)
        result = await handler(request)
        self._observe_result(name, arguments, result)
        return result


def build_change_layer_run_metrics(
    *,
    scope: ChangeScopeMetrics,
    activity: Any,
    protocol: Any,
    project_control: Any,
    mutation: Any,
) -> dict[str, object]:
    receipt = activity.snapshot()
    final_paths = [
        str(item.get("path"))
        for item in receipt.get("files", [])
        if isinstance(item, dict) and isinstance(item.get("path"), str)
    ]
    mutation_paths = list(getattr(activity, "mutation_paths", ()))
    source_write_events = [
        path
        for path in mutation_paths
        if change_layer_for_path(path) != "composition"
    ]
    source_paths = list(dict.fromkeys(source_write_events))
    by_operation = getattr(project_control, "requestsByOperation", {})
    project_control_reads = sum(
        int(by_operation.get(name, 0)) for name in _PROJECT_CONTROL_READ_OPERATIONS
    )
    layers = list(scope.taskChangeLayers) or list(change_layers_for_paths(final_paths))
    task_change_layer = (
        layers[0] if len(layers) == 1 else "mixed" if layers else "none"
    )
    return {
        "taskChangeLayer": task_change_layer,
        "taskChangeLayers": layers,
        "skillLoaded": bool(scope.skillsLoaded),
        "skillsLoaded": list(scope.skillsLoaded),
        "projectControlReads": project_control_reads,
        "appUIModelMutationAttempts": int(getattr(mutation, "requests", 0)),
        "mutationErrorCategories": dict(
            getattr(mutation, "errorCategories", {})
        ),
        "semanticReplans": int(getattr(mutation, "semanticReplans", 0)),
        "crossLayerTransitionCount": scope.crossLayerTransitionCount,
        "blockedCrossLayerRepairAttempts": scope.blockedCrossLayerRepairAttempts,
        "workspaceIntegrityBlockers": scope.workspaceIntegrityBlockers,
        "sourceWrites": len(source_write_events),
        "sourceWritePaths": source_paths,
        "finalChangedPaths": final_paths,
        "modelCalls": int(getattr(protocol, "modelCalls", 0)),
        "toolCalls": int(getattr(protocol, "toolCalls", 0)),
    }
