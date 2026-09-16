from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any, Literal, TypeAlias

from ..resource_scope import (
    change_layers_for_paths,
    resource_keys_for_evidence,
    resource_keys_for_paths,
)
from ..service_contracts.verification import ServiceContractHostCheck
from .models import CreatorValidationCheck


ValidationStatus = Literal["passed", "failed", "stale"]
FailureSemantics: TypeAlias = dict[str, object]


@dataclass(frozen=True, slots=True)
class ValidationAttributionContext:
    task_scope: tuple[str, ...]
    scope_resources: tuple[str, ...]
    changed_resources: tuple[str, ...]
    changed_paths: tuple[str, ...]


def _attribution_context(activity: Any, scope: Any) -> ValidationAttributionContext:
    receipt = activity.snapshot()
    changed_paths = tuple(
        str(item.get("path"))
        for item in receipt.get("files", [])
        if isinstance(item, dict) and isinstance(item.get("path"), str)
    )
    changed_resources = resource_keys_for_paths(changed_paths)
    changed_layers = change_layers_for_paths(changed_paths)
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


def attribute_validation_failure(
    *,
    status: ValidationStatus,
    checks: Sequence[CreatorValidationCheck],
    host_checks: Sequence[ServiceContractHostCheck],
    context: ValidationAttributionContext,
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
        )
    except Exception as error:
        if context is None:
            context = _fallback_context(activity, scope)
        try:
            on_degraded(error)
        except Exception:
            pass
        return _unknown_fail_closed(context)
