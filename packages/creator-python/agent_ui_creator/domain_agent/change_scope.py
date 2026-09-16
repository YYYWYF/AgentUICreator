from __future__ import annotations

import json
from collections.abc import Awaitable, Callable, Mapping, Sequence
from dataclasses import asdict, dataclass, field
from pathlib import PurePosixPath
from typing import Any, Literal

from langchain.agents.middleware import AgentMiddleware, ModelRequest, ModelResponse
from langchain_core.messages import ToolMessage

from ..minimal_agent.tool_policy import tool_name
from ..resource_scope import (
    ChangeLayer,
    ResourceKey,
    change_layer_for_path,
    resource_keys_for_path,
)
from ..run_control import CreatorRunControlState


_APP_UI_MODEL_RESOURCE = "app-ui-model"


@dataclass(frozen=True, slots=True)
class TaskScope:
    layers: tuple[ChangeLayer, ...] = ()
    resources: tuple[ResourceKey, ...] = ()

    def to_dict(self) -> dict[str, object]:
        return {
            "layers": list(self.layers),
            "resources": list(self.resources),
        }

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

_RESOURCE_RESULT_SIDE_EFFECT_TOOLS = frozenset(
    {
        "mutate_app_ui_model",
        "create_ui_plugin",
        "mutate_ui_plugin_source",
        "apply_agent_ui_source_item",
        "prepare_ui_service_contract_change",
        "create_ui_service_contract",
        "mutate_ui_service_contract",
    }
)


def _result_content(result: Any) -> str:
    content = getattr(result, "content", result)
    return content if isinstance(content, str) else str(content)


def _result_payload(result: Any) -> dict[str, Any] | None:
    if isinstance(result, Mapping):
        return dict(result)
    try:
        value = json.loads(_result_content(result))
    except (TypeError, ValueError):
        return None
    return value if isinstance(value, dict) else None


def _side_effect_succeeded(name: str, result: Any) -> bool:
    """Return True only when a tool result proves its side effect succeeded."""

    if getattr(result, "status", None) == "error":
        return False
    if name == "edit_file":
        # FilesystemMiddleware returns a ToolMessage with an explicit success
        # status for a committed edit.  Its human-readable content is not a
        # stable machine contract, so an unknown status fails closed.
        return getattr(result, "status", None) == "success"
    payload = _result_payload(result)
    return payload is not None and payload.get("ok") is True


def _scope_commit_allowed(name: str, result: Any) -> bool:
    """Return whether a successful result is allowed to expand task scope."""

    if name != "prepare_ui_service_contract_change":
        return True
    payload = _result_payload(result)
    if payload is None or payload.get("ok") is not True:
        return False
    value = payload.get("result")
    if not isinstance(value, Mapping) or value.get("status") != "authorized":
        return False
    authorization_id = value.get("authorizationId")
    if not isinstance(authorization_id, str) or not authorization_id.strip():
        return False
    return any(
        resource.startswith("service:")
        for resource in resource_keys_for_tool_result(name, payload)
    )


def _resource_key(prefix: str, value: Any) -> ResourceKey | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    if not normalized:
        return None
    return f"{prefix}:{normalized}"


def _append_resource(resources: list[ResourceKey], resource: ResourceKey | None) -> None:
    if resource is not None and resource not in resources:
        resources.append(resource)


def _append_plugin_node_resources(
    resources: list[ResourceKey], value: Any
) -> None:
    if not isinstance(value, Mapping):
        return
    _append_resource(resources, _resource_key("plugin-instance", value.get("id")))
    _append_resource(resources, _resource_key("plugin", value.get("pluginId")))
    slots = value.get("slots")
    if isinstance(slots, Mapping):
        for children in slots.values():
            if isinstance(children, Sequence) and not isinstance(
                children, (str, bytes)
            ):
                for child in children:
                    _append_plugin_node_resources(resources, child)


def _resource_keys_for_app_ui_operations(
    operations: Any,
) -> tuple[ResourceKey, ...]:
    resources: list[ResourceKey] = [_APP_UI_MODEL_RESOURCE]
    if not isinstance(operations, Sequence) or isinstance(operations, (str, bytes)):
        return tuple(resources)
    for operation in operations:
        if not isinstance(operation, Mapping):
            continue
        operation_type = operation.get("type")
        if operation_type in {
            "remove_plugin",
            "move_plugin",
            "replace_plugin",
            "update_plugin_props",
            "set_plugin_enabled",
        }:
            _append_resource(
                resources,
                _resource_key("plugin-instance", operation.get("instanceId")),
            )
        if operation_type in {"insert_plugin", "replace_plugin"}:
            _append_plugin_node_resources(
                resources,
                operation.get("plugin")
                if operation_type == "insert_plugin"
                else operation.get("replacement"),
            )
        target = operation.get("target")
        if isinstance(target, Mapping) and target.get("type") == "plugin_slot":
            _append_resource(
                resources,
                _resource_key("plugin-instance", target.get("parentInstanceId")),
            )
    return tuple(resources)


def change_layer_for_tool_call(name: str, arguments: Mapping[str, Any]) -> ChangeLayer | None:
    if name == "edit_file":
        path = arguments.get("file_path")
        return change_layer_for_path(path) if isinstance(path, str) else None
    return _STATIC_SIDE_EFFECT_LAYERS.get(name)


def resource_keys_for_tool_call(
    name: str,
    arguments: Mapping[str, Any],
) -> tuple[ResourceKey, ...]:
    """Extract semantic resources from already-authorized tool arguments."""

    if name == "edit_file":
        path = arguments.get("file_path")
        return resource_keys_for_path(path) if isinstance(path, str) else ()
    if name == "mutate_app_ui_model":
        return _resource_keys_for_app_ui_operations(arguments.get("operations"))

    resources: list[ResourceKey] = []
    if name in {"create_ui_plugin", "mutate_ui_plugin_source"}:
        _append_resource(resources, _resource_key("plugin", arguments.get("pluginId")))
    elif name == "apply_agent_ui_source_item":
        _append_resource(resources, _resource_key("source-item", arguments.get("itemId")))

    if name in {
        "prepare_ui_service_contract_change",
        "create_ui_service_contract",
        "mutate_ui_service_contract",
    }:
        service_name = arguments.get("serviceName")
        if not isinstance(service_name, str):
            service_name = arguments.get("service_name")
        _append_resource(resources, _resource_key("service", service_name))
        if not resources:
            contract_path = arguments.get("contractPath")
            if not isinstance(contract_path, str):
                contract_path = arguments.get("contract_path")
            if isinstance(contract_path, str):
                for resource in resource_keys_for_path(contract_path):
                    _append_resource(resources, resource)
    return tuple(resources)


def resource_keys_for_tool_result(name: str, result: Mapping[str, Any]) -> tuple[ResourceKey, ...]:
    """Read Host-issued semantic identities returned after a tool executes."""

    value: Any = result.get("result") if isinstance(result.get("result"), Mapping) else result
    resources: list[ResourceKey] = []
    if isinstance(value, Mapping):
        _append_resource(resources, _resource_key("plugin", value.get("pluginId")))
        _append_resource(resources, _resource_key("source-item", value.get("itemId")))
        _append_resource(resources, _resource_key("service", value.get("serviceName")))
        proposal = value.get("proposal")
        if isinstance(proposal, Mapping):
            _append_resource(resources, _resource_key("service", proposal.get("serviceName")))
        changed_paths = value.get("changedPaths")
        if isinstance(changed_paths, Sequence) and not isinstance(changed_paths, (str, bytes)):
            for path in changed_paths:
                if isinstance(path, str):
                    for resource in resource_keys_for_path(path):
                        _append_resource(resources, resource)
    return tuple(resources)


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
    scopeResources: list[ResourceKey] = field(default_factory=list)
    blockedCrossResourceRepairAttempts: int = 0
    attemptedChangeLayers: list[ChangeLayer] = field(default_factory=list)
    attemptedResources: list[ResourceKey] = field(default_factory=list)
    attemptedCrossLayerTransitionCount: int = 0
    failedSideEffectAttempts: int = 0
    _lastLayer: ChangeLayer | None = field(default=None, init=False, repr=False)
    _lastAttemptedLayer: ChangeLayer | None = field(
        default=None, init=False, repr=False
    )

    @property
    def resources(self) -> list[ResourceKey]:
        """Compatibility spelling for callers that use TaskScope.resources."""

        return self.scopeResources

    @property
    def task_scope(self) -> TaskScope:
        return TaskScope(
            layers=tuple(self.taskChangeLayers),
            resources=tuple(self.scopeResources),
        )

    def record_layer(self, layer: ChangeLayer) -> None:
        if self._lastLayer is not None and self._lastLayer != layer:
            self.crossLayerTransitionCount += 1
        if layer not in self.taskChangeLayers:
            self.taskChangeLayers.append(layer)
        self._lastLayer = layer

    def record_resource(self, resource: ResourceKey) -> None:
        if resource not in self.scopeResources:
            self.scopeResources.append(resource)

    def record_scope(
        self, layer: ChangeLayer, resources: Sequence[ResourceKey] = ()
    ) -> None:
        """Compatibility alias for callers that record a committed scope."""

        self.commit_scope(layer, resources)

    def record_attempt(
        self, layer: ChangeLayer, resources: Sequence[ResourceKey] = ()
    ) -> None:
        if (
            self._lastAttemptedLayer is not None
            and self._lastAttemptedLayer != layer
        ):
            self.attemptedCrossLayerTransitionCount += 1
        if layer not in self.attemptedChangeLayers:
            self.attemptedChangeLayers.append(layer)
        for resource in resources:
            if resource not in self.attemptedResources:
                self.attemptedResources.append(resource)
        self._lastAttemptedLayer = layer

    def commit_scope(
        self, layer: ChangeLayer, resources: Sequence[ResourceKey] = ()
    ) -> None:
        self.record_layer(layer)
        for resource in resources:
            self.record_resource(resource)

    def record_skill(self, name: str) -> None:
        if name not in self.skillsLoaded:
            self.skillsLoaded.append(name)

    def to_dict(self) -> dict[str, object]:
        value = asdict(self)
        value.pop("_lastLayer", None)
        value.pop("_lastAttemptedLayer", None)
        value["taskScope"] = self.task_scope.to_dict()
        return value


class ScopeAwareRecoveryGuard(AgentMiddleware):
    """Keep failures from authorizing repair outside the current task scope."""

    def __init__(
        self,
        *,
        service_resource_resolver: Callable[
            [str, Mapping[str, Any]], Sequence[ResourceKey]
        ]
        | None = None,
        run_control: CreatorRunControlState | None = None,
    ) -> None:
        self.metrics = ChangeScopeMetrics()
        self._blocked_layers: frozenset[ChangeLayer] | None = None
        self._blocked_resources: frozenset[ResourceKey] | None = None
        self._blocker: dict[str, object] | None = None
        self._service_resource_resolver = service_resource_resolver
        self.run_control = run_control

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
        self._blocked_resources = frozenset(self.metrics.scopeResources)
        self._blocker = evidence
        if workspace_integrity:
            self.metrics.workspaceIntegrityBlockers += 1

    @staticmethod
    def _recovery_action(value: Any) -> str | None:
        if isinstance(value, Mapping):
            action = value.get("action")
            return None if action is None else str(action)
        return value if isinstance(value, str) else None

    @classmethod
    def _is_terminal_workspace_integrity(
        cls,
        *,
        category: Any,
        recovery: Any,
        automatic_repair_allowed: Any = None,
    ) -> bool:
        if category != "workspace_integrity":
            return False
        if recovery is None:
            # Older tool fixtures may omit the recovery object.  Treat a
            # workspace-integrity result without an affirmative repair
            # allowance as terminal rather than silently reopening repair.
            return automatic_repair_allowed is not True
        if cls._recovery_action(recovery) != "stop_and_report_blocker":
            return False
        if automatic_repair_allowed is False:
            return True
        return isinstance(recovery, Mapping) and (
            recovery.get("atomicRetryAllowed") is False
            or recovery.get("automaticRepairAllowed") is False
            or recovery.get("automaticCrossLayerRepairAllowed") is False
            or recovery.get("automaticCrossResourceRepairAllowed") is False
        )

    def _activate_blocker(self, evidence: dict[str, object]) -> None:
        if self.run_control is not None:
            recorded = self.run_control.block(
                category=str(evidence.get("category") or "workspace_integrity"),
                code=str(evidence.get("code") or "WORKSPACE_INTEGRITY"),
                source=str(evidence.get("source") or "creator-host"),
                message=str(
                    evidence.get("message")
                    or "The Creator Host found a workspace-integrity blocker."
                ),
                details=(
                    evidence.get("details")
                    if isinstance(evidence.get("details"), Mapping)
                    else {}
                ),
                recovery=(
                    evidence.get("recovery")
                    if isinstance(evidence.get("recovery"), Mapping)
                    else {"action": "stop_and_report_blocker"}
                ),
            )
            if recorded:
                self._preserve_scope(evidence, workspace_integrity=True)
            return
        self._preserve_scope(evidence, workspace_integrity=True)

    def _resources_for_call(
        self, name: str, arguments: Mapping[str, Any]
    ) -> tuple[ResourceKey, ...]:
        resources = list(resource_keys_for_tool_call(name, arguments))
        if self._service_resource_resolver is not None:
            try:
                resolved = self._service_resource_resolver(name, arguments) or ()
            except Exception:
                resolved = ()
            # A Host-known Service identity is authoritative.  Discard the
            # filename-derived fallback for a Service contract path so the
            # scope never contains an opaque or guessed Service resource.
            if name == "edit_file" and resolved:
                resources = [
                    resource
                    for resource in resources
                    if not resource.startswith("service:")
                ]
            for resource in resolved:
                _append_resource(resources, resource)
        return tuple(resources)

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
            if (
                isinstance(error, dict)
                and self._is_terminal_workspace_integrity(
                    category=error.get("category"),
                    recovery=error.get("recovery"),
                    automatic_repair_allowed=error.get("automaticRepairAllowed"),
                )
            ):
                self._activate_blocker(
                    {
                        "source": name,
                        "code": str(error.get("code") or "WORKSPACE_INTEGRITY"),
                        "category": "workspace_integrity",
                        "message": str(
                            error.get("message")
                            or "The AppUIModel mutation cannot be repaired automatically."
                        ),
                        "details": (
                            error.get("details")
                            if isinstance(error.get("details"), Mapping)
                            else {}
                        ),
                        "recovery": (
                            error.get("recovery")
                            if isinstance(error.get("recovery"), Mapping)
                            else {"action": "stop_and_report_blocker"}
                        ),
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
                and self._is_terminal_workspace_integrity(
                    category=semantics.get("category"),
                    recovery=semantics.get("recovery"),
                    automatic_repair_allowed=semantics.get(
                        "automaticRepairAllowed"
                    ),
                )
            ):
                self._activate_blocker(
                    {
                        "source": name,
                        "code": "CREATOR_VALIDATION_WORKSPACE_INTEGRITY",
                        "category": "workspace_integrity",
                        "message": (
                            "Host validation found a workspace-integrity blocker "
                            f"(attribution={semantics.get('attribution') or 'unknown'})."
                        ),
                        "details": dict(semantics),
                        "recovery": {"action": "stop_and_report_blocker"},
                    }
                )
        elif name == "inspect_runtime_errors":
            result_value = payload.get("result")
            if (
                isinstance(result_value, dict)
                and result_value.get("runtimeStatus") == "failed"
            ):
                failure_layers = runtime_failure_layers(result_value)
                task_layers = set(self.metrics.taskChangeLayers)
                outside_scope = not failure_layers or any(
                    layer not in task_layers for layer in failure_layers
                )
                evidence = {
                    "source": name,
                    "attribution": (
                        "outside_composition"
                        if self.metrics.taskChangeLayers == ["composition"]
                        and outside_scope
                        else "outside_task_scope"
                        if outside_scope
                        else "in_scope"
                    ),
                    "failureLayers": list(failure_layers),
                }
                if outside_scope:
                    self._activate_blocker(
                        {
                            **evidence,
                            "code": "RUNTIME_WORKSPACE_INTEGRITY",
                            "category": "workspace_integrity",
                            "message": (
                                "Runtime verification found an error that cannot be "
                                "repaired within the current task scope."
                            ),
                            "details": {
                                "failureLayers": list(failure_layers),
                                "currentErrorCount": len(
                                    result_value.get("currentErrors", [])
                                    if isinstance(result_value.get("currentErrors"), list)
                                    else []
                                ),
                                "compositionCheckCount": len(
                                    result_value.get("compositionChecks", [])
                                    if isinstance(result_value.get("compositionChecks"), list)
                                    else []
                                ),
                            },
                            "recovery": {
                                "action": "stop_and_report_blocker",
                                "automaticRepairAllowed": False,
                            },
                        }
                    )
                else:
                    self._preserve_scope(
                        evidence,
                        workspace_integrity=False,
                    )

    def _is_cross_layer_blocked(self, layer: ChangeLayer | None) -> bool:
        return (
            layer is not None
            and self._blocked_layers is not None
            and layer not in self._blocked_layers
        )

    @staticmethod
    def _is_side_effect_tool(name: str) -> bool:
        return name == "edit_file" or name in _STATIC_SIDE_EFFECT_LAYERS

    def _is_cross_resource_blocked(
        self,
        layer: ChangeLayer | None,
        resources: Sequence[ResourceKey],
    ) -> bool:
        if layer is None or self._blocked_layers is None:
            return False
        if layer not in self._blocked_layers:
            return False
        allowed = self._blocked_resources or frozenset()
        if not resources:
            return True
        specific_resources = tuple(
            resource
            for resource in resources
            if resource != _APP_UI_MODEL_RESOURCE
        )
        # app-ui-model is a shared Composition document, not permission to
        # mutate every Plugin instance represented by that document.
        if not specific_resources:
            return _APP_UI_MODEL_RESOURCE not in allowed
        return any(resource not in allowed for resource in specific_resources)

    def _blocked_message(
        self,
        call: dict[str, Any],
        layer: ChangeLayer | None,
        resources: Sequence[ResourceKey],
    ) -> ToolMessage:
        cross_layer = layer is not None and self._is_cross_layer_blocked(layer)
        if cross_layer:
            code = "CROSS_LAYER_REPAIR_PROHIBITED"
            self.metrics.blockedCrossLayerRepairAttempts += 1
            message = (
                "The current task-scope boundary does not authorize automatic "
                f"repair in the {layer} layer. Stop and report the blocker."
            )
        else:
            code = "CROSS_RESOURCE_REPAIR_PROHIBITED"
            self.metrics.blockedCrossResourceRepairAttempts += 1
            message = (
                "The current task-scope boundary does not authorize automatic "
                "repair of the requested resource. Stop and report the blocker."
            )
        content = json.dumps(
            {
                "ok": False,
                "error": {
                    "code": code,
                    "category": "workspace_integrity",
                    "message": message,
                    "stateChanged": False,
                    "observationStillValid": True,
                    "details": {
                        "blocker": self._blocker,
                        "requestedResources": list(resources),
                        "allowedResources": sorted(self._blocked_resources or ()),
                    },
                    "recovery": {
                        "action": "stop_and_report_blocker",
                        "automaticCrossLayerRepairAllowed": False,
                        "automaticCrossResourceRepairAllowed": False,
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

    def _commit_tool_result(
        self,
        name: str,
        layer: ChangeLayer | None,
        resources: Sequence[ResourceKey],
        result: Any,
    ) -> None:
        if layer is None or not self._is_side_effect_tool(name):
            return
        succeeded = _side_effect_succeeded(name, result)
        if not succeeded:
            self.metrics.failedSideEffectAttempts += 1
            return
        if not _scope_commit_allowed(name, result):
            return
        committed_resources = list(resources)
        payload = _result_payload(result)
        if payload is not None and name in _RESOURCE_RESULT_SIDE_EFFECT_TOOLS:
            for resource in resource_keys_for_tool_result(name, payload):
                _append_resource(committed_resources, resource)
        self.metrics.commit_scope(layer, committed_resources)

    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelResponse:
        if self.run_control is not None:
            self.run_control.assert_runnable()
        return handler(request.override(tools=self._filter_tools(request.tools)))

    async def awrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], Awaitable[ModelResponse]],
    ) -> ModelResponse:
        if self.run_control is not None:
            self.run_control.assert_runnable()
        return await handler(request.override(tools=self._filter_tools(request.tools)))

    def _assert_tool_runnable(self) -> None:
        if self.run_control is not None:
            self.run_control.assert_tool_runnable()

    def wrap_tool_call(self, request: Any, handler: Callable[[Any], Any]) -> Any:
        self._assert_tool_runnable()
        call, name, arguments = self._call(request)
        layer = change_layer_for_tool_call(name, arguments)
        resources = self._resources_for_call(name, arguments)
        if layer is not None:
            self.metrics.record_attempt(layer, resources)
        if self._blocked_layers is not None and self._is_side_effect_tool(name) and (
            layer is None
            or self._is_cross_layer_blocked(layer)
            or self._is_cross_resource_blocked(layer, resources)
        ):
            return self._blocked_message(call, layer, resources)
        try:
            result = handler(request)
        except BaseException:
            if layer is not None and self._is_side_effect_tool(name):
                self.metrics.failedSideEffectAttempts += 1
            raise
        self._commit_tool_result(name, layer, resources, result)
        self._observe_result(name, arguments, result)
        return result

    async def awrap_tool_call(
        self, request: Any, handler: Callable[[Any], Awaitable[Any]]
    ) -> Any:
        self._assert_tool_runnable()
        call, name, arguments = self._call(request)
        layer = change_layer_for_tool_call(name, arguments)
        resources = self._resources_for_call(name, arguments)
        if layer is not None:
            self.metrics.record_attempt(layer, resources)
        if self._blocked_layers is not None and self._is_side_effect_tool(name) and (
            layer is None
            or self._is_cross_layer_blocked(layer)
            or self._is_cross_resource_blocked(layer, resources)
        ):
            return self._blocked_message(call, layer, resources)
        try:
            result = await handler(request)
        except BaseException:
            if layer is not None and self._is_side_effect_tool(name):
                self.metrics.failedSideEffectAttempts += 1
            raise
        self._commit_tool_result(name, layer, resources, result)
        self._observe_result(name, arguments, result)
        return result


def build_change_layer_run_metrics(
    *,
    scope: ChangeScopeMetrics,
    activity: Any,
    protocol: Any,
    project_control: Any,
    mutation: Any,
    run_control: CreatorRunControlState | None = None,
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
    layers = list(scope.taskChangeLayers)
    scope_resources = list(scope.scopeResources)
    task_change_layer = (
        layers[0] if len(layers) == 1 else "mixed" if layers else "none"
    )
    terminal_metrics = (
        {} if run_control is None else run_control.metrics()
    )
    return {
        "executedChangeLayer": task_change_layer,
        "executedChangeLayers": layers,
        "taskChangeLayer": task_change_layer,
        "taskChangeLayers": layers,
        "taskScope": {"layers": layers, "resources": scope_resources},
        "scopeResources": scope_resources,
        "attemptedChangeLayers": list(scope.attemptedChangeLayers),
        "attemptedResources": list(scope.attemptedResources),
        "attemptedCrossLayerTransitionCount": (
            scope.attemptedCrossLayerTransitionCount
        ),
        "failedSideEffectAttempts": scope.failedSideEffectAttempts,
        "skillLoaded": bool(scope.skillsLoaded),
        "skillsLoaded": list(scope.skillsLoaded),
        "projectControlReads": project_control_reads,
        "appUIModelMutationAttempts": int(getattr(mutation, "requests", 0)),
        "appUIModelMutationOperations": int(getattr(mutation, "operations", 0)),
        "successfulAppUIModelMutations": int(
            getattr(mutation, "successfulRequests", 0)
        ),
        "mutationErrorCategories": dict(
            getattr(mutation, "errorCategories", {})
        ),
        "semanticReplans": int(getattr(mutation, "semanticReplans", 0)),
        "crossLayerTransitionCount": scope.crossLayerTransitionCount,
        "blockedCrossLayerRepairAttempts": scope.blockedCrossLayerRepairAttempts,
        "blockedCrossResourceRepairAttempts": scope.blockedCrossResourceRepairAttempts,
        "workspaceIntegrityBlockers": scope.workspaceIntegrityBlockers,
        "sourceWrites": len(source_write_events),
        "sourceWritePaths": source_paths,
        "finalChangedPaths": final_paths,
        "modelCalls": int(getattr(protocol, "modelCalls", 0)),
        "toolCalls": int(getattr(protocol, "toolCalls", 0)),
        **terminal_metrics,
    }
