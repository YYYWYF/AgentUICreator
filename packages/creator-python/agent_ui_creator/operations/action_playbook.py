from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from time import monotonic
from typing import Any

from ..app_ui_model import AppUIModelMutationError, AppUIModelMutationService
from .models import (
    CreatorActionCandidate,
    CreatorDomainSnapshot,
    CreatorOperationExecutionResult,
    CreatorOperationMetrics,
    CreatorOperationPostconditionResult,
    CreatorOperationVerificationResult,
)
from .snapshot import CreatorDomainSnapshotProvider
from .verification import CompositionOperationVerificationService


_SEMANTIC_OPERATIONS = {
    "add_existing_plugin": "insert_plugin_default",
    "remove_plugin": "remove_plugin_default",
    "move_plugin": "move_plugin_to",
}
_STALE_ACTION_ERROR_CODES = frozenset(
    {"APP_UI_MODEL_HASH_CONFLICT", "CREATOR_ACTION_NOT_AVAILABLE"}
)


class _HostResultInvalid(ValueError):
    def __init__(self, message: str, details: Mapping[str, Any] | None = None) -> None:
        super().__init__(message)
        self.details = dict(details or {})


@dataclass(frozen=True, slots=True)
class _HostExpectations:
    expected_runtime: Mapping[str, Any]
    expected_geometry: Mapping[str, Any] | None
    expected_placement: Mapping[str, Any] | None
    expected_workspace_fill: list[Mapping[str, Any]] | None
    instance_id: str | None


def _required_mapping(value: Any, name: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise _HostResultInvalid(
            f"Host mutation result {name} must be an object.",
            {"field": name},
        )
    return value


def _string_list(
    value: Any,
    name: str,
    *,
    default: list[str] | None = None,
) -> list[str]:
    if value is None:
        return list(default or [])
    if not isinstance(value, list) or not all(
        isinstance(item, str) and item.strip() for item in value
    ):
        raise _HostResultInvalid(
            f"Host mutation result {name} must be an array of non-empty strings.",
            {"field": name},
        )
    return list(value)


def _validate_expected_placement(
    value: Any,
    *,
    instance_id: str,
    required: bool,
) -> Mapping[str, Any] | None:
    if value is None:
        if required:
            raise _HostResultInvalid(
                "Host mutation result expectedPlacement is required.",
                {"field": "semanticComposition.expectedPlacement"},
            )
        return None
    placement = _required_mapping(value, "semanticComposition.expectedPlacement")
    if placement.get("instanceId") != instance_id:
        raise _HostResultInvalid(
            "Host mutation result expectedPlacement targets the wrong instance.",
            {
                "field": "semanticComposition.expectedPlacement.instanceId",
                "expected": instance_id,
                "actual": placement.get("instanceId"),
            },
        )
    placement_type = placement.get("type")
    if placement_type == "relative":
        if (
            not isinstance(placement.get("anchorInstanceId"), str)
            or placement.get("relation") not in {"before", "after"}
        ):
            raise _HostResultInvalid(
                "Host mutation result relative expectedPlacement is invalid.",
                {"field": "semanticComposition.expectedPlacement"},
            )
    elif placement_type == "plugin_slot":
        if not isinstance(placement.get("parentInstanceId"), str) or not isinstance(
            placement.get("slot"), str
        ):
            raise _HostResultInvalid(
                "Host mutation result Plugin Slot expectedPlacement is invalid.",
                {"field": "semanticComposition.expectedPlacement"},
            )
    else:
        raise _HostResultInvalid(
            "Host mutation result expectedPlacement has an unsupported type.",
            {"field": "semanticComposition.expectedPlacement.type"},
        )
    return placement


def _validate_host_result(
    mutation: Mapping[str, Any], candidate: CreatorActionCandidate
) -> _HostExpectations:
    changed = mutation.get("changed")
    if not isinstance(changed, bool):
        raise _HostResultInvalid(
            "Host mutation result changed must be a boolean.",
            {"field": "changed"},
        )

    expected_status = "ready" if changed else "already_satisfied"
    creator_action = _required_mapping(mutation.get("creatorAction"), "creatorAction")
    if creator_action.get("actionId") != candidate.actionId:
        raise _HostResultInvalid(
            "Host mutation result creatorAction.actionId does not match the selected action.",
            {
                "field": "creatorAction.actionId",
                "selectedActionId": candidate.actionId,
                "actualActionId": creator_action.get("actionId"),
            },
        )
    if creator_action.get("actionKind") != candidate.kind:
        raise _HostResultInvalid(
            "Host mutation result creatorAction.actionKind does not match the current Action Candidate.",
            {
                "field": "creatorAction.actionKind",
                "selectedActionKind": candidate.kind,
                "actualActionKind": creator_action.get("actionKind"),
            },
        )
    if creator_action.get("status") != expected_status:
        raise _HostResultInvalid(
            "Host mutation result creatorAction.status is inconsistent with changed.",
            {
                "field": "creatorAction.status",
                "changed": changed,
                "expectedStatus": expected_status,
                "actualStatus": creator_action.get("status"),
            },
        )

    semantic = _required_mapping(
        mutation.get("semanticComposition"), "semanticComposition"
    )
    expected_operation = (
        "insert_plugin_to"
        if candidate.kind == "add_existing_plugin" and candidate.effect.type == "workspace_region"
        else _SEMANTIC_OPERATIONS[candidate.kind]
    )
    if semantic.get("actionId") != candidate.actionId:
        raise _HostResultInvalid(
            "Host mutation result semanticComposition.actionId does not match the selected action.",
            {
                "field": "semanticComposition.actionId",
                "selectedActionId": candidate.actionId,
                "actualActionId": semantic.get("actionId"),
            },
        )
    if semantic.get("actionKind") != candidate.kind:
        raise _HostResultInvalid(
            "Host mutation result semanticComposition.actionKind does not match the current Action Candidate.",
            {
                "field": "semanticComposition.actionKind",
                "selectedActionKind": candidate.kind,
                "actualActionKind": semantic.get("actionKind"),
            },
        )
    if semantic.get("actionStatus") != expected_status:
        raise _HostResultInvalid(
            "Host mutation result semanticComposition.actionStatus is inconsistent with changed.",
            {
                "field": "semanticComposition.actionStatus",
                "changed": changed,
                "expectedStatus": expected_status,
                "actualStatus": semantic.get("actionStatus"),
            },
        )
    if semantic.get("operation") != expected_operation:
        raise _HostResultInvalid(
            "Host mutation result semantic operation does not match the Action Candidate kind.",
            {
                "field": "semanticComposition.operation",
                "expectedOperation": expected_operation,
                "actualOperation": semantic.get("operation"),
            },
        )
    if semantic.get("semanticLoweringSucceeded") is not True:
        raise _HostResultInvalid(
            "Host mutation result semantic lowering did not succeed.",
            {"field": "semanticComposition.semanticLoweringSucceeded"},
        )

    expected_runtime = _required_mapping(
        semantic.get("expectedRuntime"), "semanticComposition.expectedRuntime"
    )
    present = _string_list(
        expected_runtime.get("presentInstanceIds"),
        "semanticComposition.expectedRuntime.presentInstanceIds",
    )
    absent = _string_list(
        expected_runtime.get("absentInstanceIds"),
        "semanticComposition.expectedRuntime.absentInstanceIds",
    )
    normalized_runtime = {
        "presentInstanceIds": present,
        "absentInstanceIds": absent,
    }
    expected_geometry: Mapping[str, Any] | None = None
    expected_placement: Mapping[str, Any] | None = None
    expected_workspace_fill: list[Mapping[str, Any]] | None = None
    raw_workspace_fill = semantic.get("expectedWorkspaceFill")
    if raw_workspace_fill is not None:
        if not isinstance(raw_workspace_fill, list) or not raw_workspace_fill or len(raw_workspace_fill) > 3:
            raise _HostResultInvalid(
                "Host mutation result expectedWorkspaceFill is invalid.",
                {"field": "semanticComposition.expectedWorkspaceFill"},
            )
        expected_workspace_fill = []
        for item in raw_workspace_fill:
            if (
                not isinstance(item, Mapping)
                or not isinstance(item.get("instanceId"), str)
                or item.get("region") not in {"left", "center", "right"}
                or item.get("axis") != "width"
                or not isinstance(item.get("trackIndex"), int)
                or isinstance(item.get("trackIndex"), bool)
                or item["trackIndex"] not in {0, 1, 2}
            ):
                raise _HostResultInvalid(
                    "Host mutation result expectedWorkspaceFill entry is invalid.",
                    {"field": "semanticComposition.expectedWorkspaceFill"},
                )
            expected_workspace_fill.append(item)

    if candidate.kind == "add_existing_plugin":
        if changed:
            if len(present) != 1 or absent:
                raise _HostResultInvalid(
                    "Host mutation result add expectations must contain exactly one present instance.",
                    {"field": "semanticComposition.expectedRuntime"},
                )
            instance_id = present[0]
            if candidate.effect.type == "workspace_region":
                if semantic.get("expectedGeometry") is not None or semantic.get("expectedPlacement") is not None:
                    raise _HostResultInvalid(
                        "Workspace Add must use an explicit Workspace fill expectation.",
                        {"field": "semanticComposition"},
                    )
                if expected_workspace_fill is None or not any(
                    item["instanceId"] == instance_id and item["region"] == candidate.effect.region
                    for item in expected_workspace_fill
                ):
                    raise _HostResultInvalid(
                        "Workspace Add must expect the selected Region.",
                        {"field": "semanticComposition.expectedWorkspaceFill"},
                    )
            elif semantic.get("expectedPlacement") is not None:
                if semantic.get("expectedGeometry") is not None:
                    raise _HostResultInvalid(
                        "Host mutation result Add cannot declare both placement and geometry.",
                        {"field": "semanticComposition"},
                    )
                expected_placement = _validate_expected_placement(
                    semantic.get("expectedPlacement"), instance_id=instance_id, required=True
                )
                if expected_placement["type"] != "plugin_slot":
                    raise _HostResultInvalid(
                        "Host mutation result Add expectedPlacement must target a Plugin Slot.",
                        {"field": "semanticComposition.expectedPlacement"},
                    )
            elif candidate.effect.type == "add_default":
                expected_geometry = _required_mapping(
                    semantic.get("expectedGeometry"),
                    "semanticComposition.expectedGeometry",
                )
                if expected_geometry.get("instanceId") != instance_id:
                    raise _HostResultInvalid(
                        "Host mutation result expectedGeometry targets the wrong instance.",
                        {
                            "field": "semanticComposition.expectedGeometry.instanceId",
                            "expected": instance_id,
                            "actual": expected_geometry.get("instanceId"),
                        },
                    )
        else:
            if absent or candidate.target.instanceId is not None and present != [
                candidate.target.instanceId
            ]:
                raise _HostResultInvalid(
                    "Host mutation result already-satisfied add expectations are inconsistent.",
                    {"field": "semanticComposition.expectedRuntime"},
                )
            instance_id = candidate.target.instanceId or (present[0] if present else None)
    elif candidate.kind == "remove_plugin":
        instance_id = candidate.target.instanceId
        if changed:
            if instance_id is None or absent != [instance_id] or present:
                raise _HostResultInvalid(
                    "Host mutation result remove expectations must contain exactly the selected absent instance.",
                    {"field": "semanticComposition.expectedRuntime"},
                )
        elif absent != ([] if instance_id is None else [instance_id]) or present:
            raise _HostResultInvalid(
                "Host mutation result already-satisfied remove expectations are inconsistent.",
                {"field": "semanticComposition.expectedRuntime"},
            )
    else:
        instance_id = candidate.target.instanceId
        if instance_id is None or present != [instance_id] or absent:
            raise _HostResultInvalid(
                "Host mutation result move expectations must contain exactly the selected present instance.",
                {"field": "semanticComposition.expectedRuntime"},
            )
        expected_placement = _validate_expected_placement(
            semantic.get("expectedPlacement"),
            instance_id=instance_id,
            required=candidate.effect.type not in {"row_edge", "workspace_region"},
        )

    return _HostExpectations(
        expected_runtime=normalized_runtime,
        expected_geometry=expected_geometry,
        expected_placement=expected_placement,
        expected_workspace_fill=expected_workspace_fill,
        instance_id=instance_id,
    )


def _layout_node_paths(layout: Mapping[str, Any]) -> dict[str, tuple[int, ...]]:
    paths: dict[str, tuple[int, ...]] = {}

    def visit(node: Any, path: tuple[int, ...]) -> None:
        if not isinstance(node, Mapping):
            return
        node_ref = node.get("nodeRef")
        if isinstance(node_ref, str):
            paths[node_ref] = path
        children = node.get("children")
        if isinstance(children, list):
            for index, child in enumerate(children):
                visit(child, (*path, index))
        child = node.get("child")
        if isinstance(child, Mapping):
            visit(child, (*path, 0))

    visit(layout, ())
    return paths


def _instance_layout_path(
    snapshot: CreatorDomainSnapshot,
    instance: Mapping[str, Any],
    paths: Mapping[str, tuple[int, ...]],
) -> tuple[int, ...] | None:
    target = instance.get("target")
    if not isinstance(target, Mapping) or target.get("type") != "layout_slot":
        return None
    slot_ref = target.get("slotRef")
    raw_app_ui_model = snapshot.raw.get("appUIModel")
    slots = (
        raw_app_ui_model.get("slots")
        if isinstance(raw_app_ui_model, Mapping)
        else None
    )
    if not isinstance(slot_ref, str) or not isinstance(slots, list):
        return None
    slot = next(
        (
            item
            for item in slots
            if isinstance(item, Mapping)
            and isinstance(item.get("target"), Mapping)
            and item["target"].get("type") == "layout_slot"
            and item["target"].get("slotRef") == slot_ref
        ),
        None,
    )
    node_ref = slot.get("nodeRef") if isinstance(slot, Mapping) else None
    return paths.get(node_ref) if isinstance(node_ref, str) else None


def _relative_order_matches(
    snapshot: CreatorDomainSnapshot,
    instances_by_id: Mapping[str, Mapping[str, Any]],
    instance_id: str,
    anchor_instance_id: str,
    relation: str,
) -> bool | None:
    raw_app_ui_model = snapshot.raw.get("appUIModel")
    layout = raw_app_ui_model.get("layout") if isinstance(raw_app_ui_model, Mapping) else None
    if not isinstance(layout, Mapping):
        return None
    paths = _layout_node_paths(layout)

    def order_key(target_id: str) -> tuple[int, ...] | None:
        instance = instances_by_id.get(target_id)
        if instance is None:
            return None
        path = _instance_layout_path(snapshot, instance, paths)
        index = instance.get("index")
        if path is None or not isinstance(index, int) or isinstance(index, bool):
            return None
        return (*path, index)

    target_key = order_key(instance_id)
    anchor_key = order_key(anchor_instance_id)
    if target_key is None or anchor_key is None:
        return None
    return target_key < anchor_key if relation == "before" else target_key > anchor_key


def _workspace_track_matches(
    snapshot: CreatorDomainSnapshot,
    instances_by_id: Mapping[str, Mapping[str, Any]],
    expected_workspace_fill: list[Mapping[str, Any]],
) -> bool | None:
    raw_app_ui_model = snapshot.raw.get("appUIModel")
    if not isinstance(raw_app_ui_model, Mapping):
        return None
    layout = raw_app_ui_model.get("layout")
    if not isinstance(layout, Mapping) or layout.get("type") != "row":
        return None
    children = layout.get("children")
    if not isinstance(children, list):
        return None
    paths = _layout_node_paths(layout)
    for expectation in expected_workspace_fill:
        instance_id = expectation.get("instanceId")
        track_index = expectation.get("trackIndex")
        instance = (
            instances_by_id.get(instance_id)
            if isinstance(instance_id, str)
            else None
        )
        if (
            instance is None
            or not isinstance(track_index, int)
            or isinstance(track_index, bool)
        ):
            return False
        path = _instance_layout_path(snapshot, instance, paths)
        if (
            path is None
            or not path
            or path[0] != track_index
            or track_index >= len(children)
        ):
            return False
    return True


def _postcondition_for_snapshot(
    snapshot: CreatorDomainSnapshot,
    candidate: CreatorActionCandidate,
    expectations: _HostExpectations,
    *,
    expected_hash: str | None,
) -> CreatorOperationPostconditionResult:
    kind = (
        "instance_absent"
        if candidate.kind == "remove_plugin"
        else "instance_present"
        if candidate.kind == "add_existing_plugin"
        else "placement"
    )
    instance_id = expectations.instance_id
    if instance_id is None and candidate.kind != "remove_plugin":
        return CreatorOperationPostconditionResult(
            status="unavailable",
            kind=kind,
            instanceId=candidate.target.instanceId,
            pluginId=candidate.target.pluginId,
            appUIModelHash=snapshot.app_ui_model_hash,
            evidence="宿主环境未识别受影响的插件实例。",
        )
    if expected_hash is None or snapshot.app_ui_model_hash != expected_hash:
        return CreatorOperationPostconditionResult(
            status="unavailable",
            kind=kind,
            instanceId=instance_id,
            pluginId=candidate.target.pluginId,
            appUIModelHash=snapshot.app_ui_model_hash,
            evidence="读回的 AppUIModel 哈希与宿主环境提交的哈希不一致。",
        )

    raw_instances = snapshot.raw.get("pluginInstances")
    if not isinstance(raw_instances, list) or not all(
        isinstance(item, Mapping) for item in raw_instances
    ):
        return CreatorOperationPostconditionResult(
            status="unavailable",
            kind=kind,
            instanceId=instance_id,
            pluginId=candidate.target.pluginId,
            appUIModelHash=snapshot.app_ui_model_hash,
            evidence="当前组合快照未包含插件实例列表。",
        )
    instances_by_id = {
        item["id"]: item
        for item in raw_instances
        if isinstance(item.get("id"), str)
    }
    instance = instances_by_id.get(instance_id) if instance_id is not None else None

    if candidate.kind == "remove_plugin":
        passed = (
            instance is None
            if instance_id is not None
            else all(
                item.get("pluginId") != candidate.target.pluginId
                for item in raw_instances
            )
        )
        evidence = (
            (
                f"实例 {instance_id} 已从持久化 AppUIModel 中移除。"
                if instance_id is not None
                else f"持久化 AppUIModel 中已无 {candidate.target.pluginId} 插件实例。"
            )
            if passed
            else (
                f"实例 {instance_id} 仍存在于持久化 AppUIModel 中。"
                if instance_id is not None
                else f"持久化 AppUIModel 中仍存在 {candidate.target.pluginId} 插件实例。"
            )
        )
    else:
        passed = (
            instance is not None
            and instance.get("pluginId") == candidate.target.pluginId
            and instance.get("enabled") is True
        )
        evidence = (
            f"实例 {instance_id} 已存在并启用，插件为 {candidate.target.pluginId}。"
            if passed
            else f"实例 {instance_id} 缺失、已禁用，或属于其他插件。"
        )

    if passed and candidate.kind != "remove_plugin":
        assert instance_id is not None
        placement = expectations.expected_placement
        if placement is not None and placement.get("type") == "plugin_slot":
            target = instance.get("target") if instance is not None else None
            passed = (
                isinstance(target, Mapping)
                and target.get("type") == "plugin_slot"
                and target.get("parentInstanceId")
                == placement.get("parentInstanceId")
                and target.get("slot") == placement.get("slot")
            )
            evidence = (
                f"实例 {instance_id} 位于插件槽 "
                f"{placement.get('parentInstanceId')}.{placement.get('slot')}。"
                if passed
                else f"实例 {instance_id} 未位于预期的插件槽。"
            )
        elif placement is not None and placement.get("type") == "relative":
            anchor_id = placement.get("anchorInstanceId")
            relation = placement.get("relation")
            relative_match = (
                _relative_order_matches(
                    snapshot,
                    instances_by_id,
                    instance_id,
                    anchor_id,
                    relation,
                )
                if isinstance(anchor_id, str) and relation in {"before", "after"}
                else None
            )
            if relative_match is None:
                return CreatorOperationPostconditionResult(
                    status="unavailable",
                    kind=kind,
                    instanceId=instance_id,
                    pluginId=candidate.target.pluginId,
                    appUIModelHash=snapshot.app_ui_model_hash,
                    evidence="持久化布局信息不足，无法确认请求的相对位置。",
                )
            passed = relative_match
            relation_label = "前" if relation == "before" else "后"
            evidence = (
                f"实例 {instance_id} 在持久化布局中位于锚点 {anchor_id} 的{relation_label}侧。"
                if passed
                else "持久化布局未满足请求的相对位置。"
            )
        elif expectations.expected_workspace_fill:
            workspace_match = _workspace_track_matches(
                snapshot, instances_by_id, expectations.expected_workspace_fill
            )
            if workspace_match is None:
                return CreatorOperationPostconditionResult(
                    status="unavailable",
                    kind=kind,
                    instanceId=instance_id,
                    pluginId=candidate.target.pluginId,
                    appUIModelHash=snapshot.app_ui_model_hash,
                    evidence="持久化布局未提供可核对的 Workspace 行轨道。",
                )
            passed = workspace_match
            evidence = (
                "持久化 Workspace 实例位于预期的行轨道。"
                if passed
                else "持久化布局未满足预期的 Workspace 行轨道。"
            )
        elif candidate.effect.type == "row_edge":
            raw_app_ui_model = snapshot.raw.get("appUIModel")
            layout = (
                raw_app_ui_model.get("layout")
                if isinstance(raw_app_ui_model, Mapping)
                else None
            )
            children = (
                layout.get("children") if isinstance(layout, Mapping) else None
            )
            paths = _layout_node_paths(layout) if isinstance(layout, Mapping) else {}
            path = _instance_layout_path(snapshot, instance, paths) if instance is not None else None
            edge = getattr(candidate.effect, "edge", None)
            if (
                not isinstance(children, list)
                or not children
                or path is None
                or not path
            ):
                return CreatorOperationPostconditionResult(
                    status="unavailable",
                    kind=kind,
                    instanceId=instance_id,
                    pluginId=candidate.target.pluginId,
                    appUIModelHash=snapshot.app_ui_model_hash,
                    evidence="持久化布局未提供目标行分支信息。",
                )
            passed = (
                path[0] == 0
                if edge == "left"
                else path[0] == len(children) - 1
            )
            evidence = (
                f"实例 {instance_id} 位于持久化行布局的"
                f"{'左' if edge == 'left' else '右'}侧。"
                if passed
                else f"持久化布局未满足行布局的{'左' if edge == 'left' else '右'}侧位置。"
            )
        elif candidate.effect.type == "workspace_region":
            return CreatorOperationPostconditionResult(
                status="unavailable",
                kind=kind,
                instanceId=instance_id,
                pluginId=candidate.target.pluginId,
                appUIModelHash=snapshot.app_ui_model_hash,
                evidence="宿主环境未提供可核对的 Workspace 轨道预期。",
            )

    return CreatorOperationPostconditionResult(
        status="passed" if passed else "failed",
        kind=kind,
        instanceId=instance_id,
        pluginId=candidate.target.pluginId,
        appUIModelHash=snapshot.app_ui_model_hash,
        evidence=evidence,
    )


class CreatorActionExecutionPlaybook:
    """Execute one exact Host-generated Creator Action by actionId."""

    def __init__(
        self,
        *,
        mutation_service: AppUIModelMutationService,
        snapshot_provider: CreatorDomainSnapshotProvider,
        verification: CompositionOperationVerificationService,
    ) -> None:
        self.mutation_service = mutation_service
        self.snapshot_provider = snapshot_provider
        self.verification = verification

    @staticmethod
    def _metrics(
        started_at: float,
        *,
        mutation_attempts: int,
        snapshot_refreshes: int,
        verification_attempts: int,
    ) -> CreatorOperationMetrics:
        return CreatorOperationMetrics(
            operationDurationMs=max(0, round((monotonic() - started_at) * 1_000)),
            executionModelCalls=0,
            mutationAttempts=mutation_attempts,
            snapshotRefreshes=snapshot_refreshes,
            verificationRuntimeFreshnessAttempts=verification_attempts,
        )

    def _result(
        self,
        started_at: float,
        *,
        candidate: CreatorActionCandidate,
        status: str,
        instance_id: str | None = None,
        mutation_changed: bool = False,
        mutation_revision: int | None = None,
        postcondition: CreatorOperationPostconditionResult | None = None,
        verification: CreatorOperationVerificationResult | None = None,
        error_code: str | None = None,
        message: str | None = None,
        details: Any = None,
        mutation_attempts: int = 0,
        snapshot_refreshes: int = 0,
    ) -> CreatorOperationExecutionResult:
        return CreatorOperationExecutionResult(
            operation=candidate.kind,
            status=status,  # type: ignore[arg-type]
            pluginId=candidate.target.pluginId,
            instanceId=instance_id,
            mutationChanged=mutation_changed,
            mutationRevision=mutation_revision,
            postcondition=postcondition,
            verification=verification,
            metrics=self._metrics(
                started_at,
                mutation_attempts=mutation_attempts,
                snapshot_refreshes=snapshot_refreshes,
                verification_attempts=(
                    0
                    if verification is None
                    else verification.runtimeFreshnessAttempts
                ),
            ),
            errorCode=error_code,
            message=message,
            details=details,
        )

    @staticmethod
    def _mutation_revision(mutation: Mapping[str, Any]) -> int | None:
        value = mutation.get("mutationRevision")
        return value if isinstance(value, int) and not isinstance(value, bool) else None

    async def _postcondition_after_mutation(
        self,
        *,
        candidate: CreatorActionCandidate,
        expectations: _HostExpectations,
        mutation: Mapping[str, Any],
    ) -> CreatorOperationPostconditionResult:
        app_ui_model = mutation.get("appUIModel")
        expected_hash = (
            app_ui_model.get("afterHash")
            if isinstance(app_ui_model, Mapping)
            else None
        )
        changed_paths = mutation.get("changedPaths")
        if (
            mutation.get("changed") is not True
            or not isinstance(changed_paths, list)
            or "app-ui/app-ui.json" not in changed_paths
        ):
            return CreatorOperationPostconditionResult(
                status="failed",
                kind=(
                    "instance_absent"
                    if candidate.kind == "remove_plugin"
                    else "instance_present"
                    if candidate.kind == "add_existing_plugin"
                    else "placement"
                ),
                instanceId=expectations.instance_id or candidate.target.instanceId,
                pluginId=candidate.target.pluginId,
                evidence="宿主环境未报告 AppUIModel 文件发生持久化变更。",
            )
        if not isinstance(expected_hash, str):
            return CreatorOperationPostconditionResult(
                status="unavailable",
                kind=(
                    "instance_absent"
                    if candidate.kind == "remove_plugin"
                    else "instance_present"
                    if candidate.kind == "add_existing_plugin"
                    else "placement"
                ),
                instanceId=expectations.instance_id or candidate.target.instanceId,
                pluginId=candidate.target.pluginId,
                evidence="宿主环境未提供提交后的 AppUIModel 哈希。",
            )
        try:
            snapshot = await self.snapshot_provider.build()
        except Exception as error:
            return CreatorOperationPostconditionResult(
                status="unavailable",
                kind=(
                    "instance_absent"
                    if candidate.kind == "remove_plugin"
                    else "instance_present"
                    if candidate.kind == "add_existing_plugin"
                    else "placement"
                ),
                instanceId=expectations.instance_id or candidate.target.instanceId,
                pluginId=candidate.target.pluginId,
                evidence=(
                    "无法读回持久化 AppUIModel（"
                    f"{type(error).__name__}）。"
                ),
            )
        return _postcondition_for_snapshot(
            snapshot,
            candidate,
            expectations,
            expected_hash=expected_hash,
        )

    def _mutation_failure(
        self,
        started_at: float,
        *,
        candidate: CreatorActionCandidate,
        error: Exception,
        mutation_attempts: int,
        snapshot_refreshes: int,
    ) -> CreatorOperationExecutionResult:
        state_changed = (
            error.state_changed
            if isinstance(error, AppUIModelMutationError)
            else False
        )
        return self._result(
            started_at,
            candidate=candidate,
            status="failed",
            instance_id=candidate.target.instanceId,
            mutation_changed=state_changed,
            error_code=getattr(error, "code", type(error).__name__),
            message=str(error),
            details=getattr(error, "details", None),
            mutation_attempts=mutation_attempts,
            snapshot_refreshes=snapshot_refreshes,
        )

    async def execute(
        self,
        snapshot: CreatorDomainSnapshot,
        candidate: CreatorActionCandidate,
    ) -> CreatorOperationExecutionResult:
        """Execute the selected action without rechecking its eligibility in Python."""

        started_at = monotonic()
        try:
            await self.verification.ensure_baseline()
        except Exception as error:
            return self._result(
                started_at,
                candidate=candidate,
                status="failed",
                instance_id=candidate.target.instanceId,
                error_code="PRODUCT_OPERATION_STATIC_BASELINE_FAILED",
                message=str(error),
            )

        current_snapshot = snapshot
        current_candidate = candidate
        mutation_attempts = 0
        snapshot_refreshes = 0
        while True:
            mutation_attempts += 1
            try:
                mutation_result = await self.mutation_service.mutate(
                    app_ui_model_hash=current_snapshot.app_ui_model_hash,
                    operations=[
                        {
                            "type": "execute_creator_action",
                            "actionId": candidate.actionId,
                        }
                    ],
                )
            except AppUIModelMutationError as error:
                if error.code not in _STALE_ACTION_ERROR_CODES or snapshot_refreshes >= 1:
                    return self._mutation_failure(
                        started_at,
                        candidate=current_candidate,
                        error=error,
                        mutation_attempts=mutation_attempts,
                        snapshot_refreshes=snapshot_refreshes,
                    )
                snapshot_refreshes += 1
                try:
                    current_snapshot = await self.snapshot_provider.build()
                except Exception as refresh_error:
                    return self._result(
                        started_at,
                        candidate=current_candidate,
                        status="failed",
                        instance_id=current_candidate.target.instanceId,
                        error_code="PRODUCT_OPERATION_SNAPSHOT_REFRESH_FAILED",
                        message=str(refresh_error),
                        details={
                            "causeCode": error.code,
                            "causeDetails": error.details,
                        },
                        mutation_attempts=mutation_attempts,
                        snapshot_refreshes=snapshot_refreshes,
                    )
                current_candidate = next(
                    (
                        item
                        for item in current_snapshot.action_catalog.candidates
                        if item.actionId == candidate.actionId
                    ),
                    None,
                )
                if current_candidate is None:
                    return self._result(
                        started_at,
                        candidate=candidate,
                        status="failed",
                        instance_id=candidate.target.instanceId,
                        error_code="PRODUCT_OPERATION_STALE",
                        message=(
                            "The selected Creator Action is no longer available "
                            "in the refreshed Action Catalog."
                        ),
                        details={
                            "actionId": candidate.actionId,
                            "causeCode": error.code,
                            "causeDetails": error.details,
                        },
                        mutation_attempts=mutation_attempts,
                        snapshot_refreshes=snapshot_refreshes,
                    )
                continue
            except Exception as error:
                return self._mutation_failure(
                    started_at,
                    candidate=current_candidate,
                    error=error,
                    mutation_attempts=mutation_attempts,
                    snapshot_refreshes=snapshot_refreshes,
                )

            mutation: Mapping[str, Any] | None = None
            try:
                raw_mutation = mutation_result.to_dict()
                mutation = _required_mapping(raw_mutation, "mutation")
                expectations = _validate_host_result(mutation, current_candidate)
            except _HostResultInvalid as error:
                return self._result(
                    started_at,
                    candidate=current_candidate,
                    status="failed",
                    instance_id=current_candidate.target.instanceId,
                    mutation_changed=(
                        mutation is not None and mutation.get("changed") is True
                    ),
                    mutation_revision=(
                        None
                        if mutation is None
                        else self._mutation_revision(mutation)
                    ),
                    error_code="PRODUCT_OPERATION_RESULT_INVALID",
                    message=str(error),
                    details=error.details,
                    mutation_attempts=mutation_attempts,
                    snapshot_refreshes=snapshot_refreshes,
                )
            except Exception as error:
                return self._result(
                    started_at,
                    candidate=current_candidate,
                    status="failed",
                    instance_id=current_candidate.target.instanceId,
                    error_code="PRODUCT_OPERATION_RESULT_INVALID",
                    message="The Host mutation result could not be read.",
                    details={"cause": str(error)},
                    mutation_attempts=mutation_attempts,
                    snapshot_refreshes=snapshot_refreshes,
                )

            mutation_revision = self._mutation_revision(mutation)
            if mutation.get("changed") is False:
                raw_app_ui_model = mutation.get("appUIModel")
                after_hash = (
                    raw_app_ui_model.get("afterHash")
                    if isinstance(raw_app_ui_model, Mapping)
                    else None
                )
                postcondition = _postcondition_for_snapshot(
                    current_snapshot,
                    current_candidate,
                    expectations,
                    expected_hash=after_hash if isinstance(after_hash, str) else None,
                )
                status = (
                    "already_satisfied"
                    if postcondition.status == "passed"
                    else "failed"
                )
                return self._result(
                    started_at,
                    candidate=current_candidate,
                    status=status,
                    instance_id=expectations.instance_id,
                    mutation_changed=False,
                    mutation_revision=mutation_revision,
                    postcondition=postcondition,
                    error_code=(
                        None
                        if status == "already_satisfied"
                        else "PRODUCT_OPERATION_POSTCONDITION_UNCONFIRMED"
                    ),
                    message=(
                        None
                        if status == "already_satisfied"
                        else "当前 AppUIModel 未能证明请求的操作已满足。"
                    ),
                    details=(
                        None
                        if status == "already_satisfied"
                        else postcondition.model_dump(mode="json")
                    ),
                    mutation_attempts=mutation_attempts,
                    snapshot_refreshes=snapshot_refreshes,
                )

            postcondition = await self._postcondition_after_mutation(
                candidate=current_candidate,
                expectations=expectations,
                mutation=mutation,
            )
            verification = await self.verification.verify(
                mutation_result=mutation,
                expected_runtime=expectations.expected_runtime,
                expected_geometry=expectations.expected_geometry,
                expected_placement=expectations.expected_placement,
                expected_workspace_fill=expectations.expected_workspace_fill,
            )
            if postcondition.status == "passed":
                status = "success"
            elif postcondition.status == "unavailable":
                status = "committed_unverified"
            else:
                status = "failed"
            return self._result(
                started_at,
                candidate=current_candidate,
                status=status,
                instance_id=expectations.instance_id,
                mutation_changed=True,
                mutation_revision=mutation_revision,
                postcondition=postcondition,
                verification=verification,
                error_code=(
                    "PRODUCT_OPERATION_POSTCONDITION_FAILED"
                    if postcondition.status == "failed"
                    else None
                ),
                message=(
                    "持久化 AppUIModel 未满足请求的操作后置条件。"
                    if postcondition.status == "failed"
                    else "AppUIModel 变更已持久化，但无法确认请求的操作后置条件。"
                    if postcondition.status == "unavailable"
                    else None
                ),
                details=(
                    None
                    if postcondition.status == "passed"
                    else postcondition.model_dump(mode="json")
                ),
                mutation_attempts=mutation_attempts,
                snapshot_refreshes=snapshot_refreshes,
            )
