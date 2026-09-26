from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, TypeAlias

from ..resource_scope import (
    change_layer_for_path,
    change_layers_for_paths,
    resource_keys_for_evidence,
    resource_keys_for_paths,
)
from ..service_contracts.verification import ServiceContractHostCheck
from .diagnostics import TypeScriptDiagnostic
from .models import CreatorValidationCheck, TypecheckDifferential, ValidationMode


ValidationStatus = Literal["passed", "failed", "stale"]
FailureSemantics: TypeAlias = dict[str, object]


@dataclass(frozen=True, slots=True)
class ValidationAttributionContext:
    task_scope: tuple[str, ...]
    scope_resources: tuple[str, ...]
    changed_resources: tuple[str, ...]
    changed_paths: tuple[str, ...]
    project_root: str | Path | None = None


def _attribution_context(activity: Any, scope: Any) -> ValidationAttributionContext:
    receipt = activity.snapshot()
    changed_paths = tuple(
        str(item.get("path"))
        for item in receipt.get("files", [])
        if isinstance(item, dict) and isinstance(item.get("path"), str)
    )
    project_root = getattr(activity, "project_root", None)
    changed_resources = resource_keys_for_paths(changed_paths, project_root=project_root)
    changed_layers = change_layers_for_paths(changed_paths, project_root=project_root)
    return ValidationAttributionContext(
        task_scope=(
            tuple(scope.taskChangeLayers)
            if scope is not None
            else tuple(changed_layers)
        ),
        scope_resources=(
            tuple(scope.scopeResources)
            if scope is not None
            else tuple(changed_resources)
        ),
        changed_resources=tuple(changed_resources),
        changed_paths=changed_paths,
        project_root=project_root,
    )


def _fallback_context(activity: Any, scope: Any) -> ValidationAttributionContext:
    try:
        return _attribution_context(activity, scope)
    except Exception:
        return ValidationAttributionContext(
            task_scope=(
                tuple(getattr(scope, "taskChangeLayers", ()))
                if scope is not None
                else ()
            ),
            scope_resources=(
                tuple(getattr(scope, "scopeResources", ()))
                if scope is not None
                else ()
            ),
            changed_resources=(),
            changed_paths=(),
        )


def _unknown_fail_closed(
    context: ValidationAttributionContext,
) -> FailureSemantics:
    return {
        "category": "workspace_integrity",
        "attribution": "unknown",
        "taskScope": list(context.task_scope),
        "taskScopeResources": list(context.scope_resources),
        "scopeResources": list(context.scope_resources),
        "changedResources": list(context.changed_resources),
        "failureLayers": [],
        "changedPaths": list(context.changed_paths),
        "automaticRepairAllowed": False,
        "automaticCrossLayerRepairAllowed": False,
        "recovery": "stop_and_report_blocker",
    }


def _diagnostic_layers(
    diagnostics: Sequence[TypeScriptDiagnostic],
    project_root: str | Path | None = None,
) -> list[str]:
    layers: list[str] = []
    for diagnostic in diagnostics:
        layer = change_layer_for_path(diagnostic.path, project_root=project_root)
        if layer is not None and layer not in layers:
            layers.append(layer)
    return layers


def _diagnostic_evidence(
    diagnostics: Sequence[TypeScriptDiagnostic],
) -> list[dict[str, str]]:
    return [diagnostic.to_dict() for diagnostic in diagnostics[:8]]


def attribute_validation_failure(
    *,
    status: ValidationStatus,
    checks: Sequence[CreatorValidationCheck],
    host_checks: Sequence[ServiceContractHostCheck],
    context: ValidationAttributionContext,
    validation_mode: ValidationMode = "delta",
    differential: TypecheckDifferential | None = None,
) -> FailureSemantics | None:
    """Classify validation evidence without deciding whether execution may continue."""

    if status == "passed":
        return None
    evidence = "\n".join(check.output for check in checks if check.status == "failed")
    if host_checks:
        evidence += "\n" + "\n".join(str(check) for check in host_checks)
    normalized = evidence.replace("\\", "/")
    markers = (
        (
            "composition",
            (
                "app-ui/app-ui.json",
                "app-ui/composition-revision.generated.json",
                "plugins/registry.generated.ts",
            ),
        ),
        ("plugin_behavior", ("plugins/", "agent-ui/")),
        ("runtime_capability", ("services/",)),
        ("agent_integration", ("agent-contract/",)),
    )
    evidence_layers = [
        layer
        for layer, candidates in markers
        if any(candidate in normalized for candidate in candidates)
    ]
    evidence_resources = resource_keys_for_evidence(
        evidence,
        known_resources=tuple(
            dict.fromkeys(
                (*context.changed_resources, *context.scope_resources)
            )
        ),
    )
    introduced_diagnostics = (
        ()
        if differential is None
        else differential.new_diagnostics
    )
    current_diagnostics = (
        ()
        if differential is None
        else differential.current_diagnostics
    )
    if (
        differential is not None
        and differential.status == "unavailable"
        and status != "stale"
    ):
        semantics = _unknown_fail_closed(context)
        semantics.update(
            {
                "validationMode": validation_mode,
                "differentialStatus": differential.status,
            }
        )
        return semantics
    if (
        differential is not None
        and differential.status == "available"
        and introduced_diagnostics
    ):
        category = "workspace_integrity"
        attribution = "introduced"
        failure_layers = _diagnostic_layers(introduced_diagnostics, context.project_root)
        automatic_repair_allowed = True
        automatic_cross_layer_repair_allowed = True
        return {
            "category": category,
            "attribution": attribution,
            "taskScope": list(context.task_scope),
            "taskScopeResources": list(context.scope_resources),
            "scopeResources": list(context.scope_resources),
            "changedResources": list(context.changed_resources),
            "failureLayers": failure_layers,
            "changedPaths": list(context.changed_paths),
            "validationMode": validation_mode,
            "differentialStatus": differential.status,
            "introducedDiagnostics": _diagnostic_evidence(introduced_diagnostics),
            "automaticRepairAllowed": automatic_repair_allowed,
            "automaticCrossLayerRepairAllowed": automatic_cross_layer_repair_allowed,
            "recovery": "repair_in_scope",
        }
    if (
        validation_mode == "clean"
        and differential is not None
        and differential.status == "available"
        and current_diagnostics
    ):
        return {
            "category": "workspace_integrity",
            "attribution": "in_scope",
            "taskScope": list(context.task_scope),
            "taskScopeResources": list(context.scope_resources),
            "scopeResources": list(context.scope_resources),
            "changedResources": list(context.changed_resources),
            "failureLayers": _diagnostic_layers(current_diagnostics, context.project_root),
            "changedPaths": list(context.changed_paths),
            "validationMode": validation_mode,
            "differentialStatus": differential.status,
            "remainingDiagnostics": _diagnostic_evidence(current_diagnostics),
            "automaticRepairAllowed": True,
            "automaticCrossLayerRepairAllowed": True,
            "recovery": "repair_in_scope",
        }
    if status == "stale":
        category = "stale_state"
        attribution = "unknown"
    elif any(
        resource in evidence_resources for resource in context.changed_resources
    ):
        category = "workspace_integrity"
        attribution = "introduced"
    elif any(
        resource in evidence_resources for resource in context.scope_resources
    ):
        category = "workspace_integrity"
        attribution = "in_scope"
    elif evidence_resources and (context.task_scope or context.scope_resources):
        category = "workspace_integrity"
        attribution = "unrelated"
    else:
        category = "workspace_integrity"
        attribution = "unknown"
    automatic_repair_allowed = attribution in {"introduced", "in_scope"}
    return {
        "category": category,
        "attribution": attribution,
        "taskScope": list(context.task_scope),
        "taskScopeResources": list(context.scope_resources),
        "scopeResources": list(context.scope_resources),
        "changedResources": list(context.changed_resources),
        "failureLayers": evidence_layers,
        "changedPaths": list(context.changed_paths),
        **(
            {
                "validationMode": validation_mode,
                "differentialStatus": differential.status,
            }
            if differential is not None
            else {}
        ),
        "automaticRepairAllowed": automatic_repair_allowed,
        "automaticCrossLayerRepairAllowed": False,
        "recovery": (
            "refresh_current_revision"
            if category == "stale_state"
            else "repair_in_scope"
            if automatic_repair_allowed
            else "stop_and_report_blocker"
        ),
    }


def attribute_validation_failure_safe(
    *,
    status: ValidationStatus,
    checks: Sequence[CreatorValidationCheck],
    host_checks: Sequence[ServiceContractHostCheck],
    activity: Any,
    scope: Any,
    validation_mode: ValidationMode = "delta",
    differential: TypecheckDifferential | None = None,
    on_degraded: Callable[[Exception], None],
) -> FailureSemantics | None:
    """Make failure attribution total for ordinary validation inputs."""

    if status == "passed":
        return None
    context: ValidationAttributionContext | None = None
    try:
        context = _attribution_context(activity, scope)
        return attribute_validation_failure(
            status=status,
            checks=checks,
            host_checks=host_checks,
            context=context,
            validation_mode=validation_mode,
            differential=differential,
        )
    except Exception as error:
        if context is None:
            context = _fallback_context(activity, scope)
        try:
            on_degraded(error)
        except Exception:
            pass
        return _unknown_fail_closed(context)
