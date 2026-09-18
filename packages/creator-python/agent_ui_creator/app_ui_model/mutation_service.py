from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import TYPE_CHECKING, Any

from ..activity import CreatorActivityRecorder
from ..domain_state import DomainObservationError
from ..files import CreatorFileState, read_creator_file_state
from ..project_control import ProjectControlClient, ProjectControlError
from .mutation_lock import ProjectMutationCoordinator
from .mutation_models import (
    APP_UI_MODEL_PATH,
    MUTABLE_PATHS,
    REGISTRY_PATH,
    AppUIModelMutationError,
    AppUIModelMutationMetrics,
    AppUIModelMutationResult,
    MAX_SEMANTIC_COMPOSITION_REPLANS,
    classify_mutation_error,
)

_HASH_LENGTH = 64
logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from ..runtime_diagnostics.store import RuntimeDiagnosticStore


def _is_sha256(value: Any) -> bool:
    return (
        isinstance(value, str)
        and len(value) == _HASH_LENGTH
        and all(character in "0123456789abcdef" for character in value)
    )


def _object(value: Any, name: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise AppUIModelMutationError(
            "APP_UI_MODEL_MUTATION_RESULT_INCONSISTENT",
            f"Target mutation result {name} must be an object.",
        )
    return value


def _hash(value: Any, name: str) -> str:
    if not _is_sha256(value):
        raise AppUIModelMutationError(
            "APP_UI_MODEL_MUTATION_RESULT_INCONSISTENT",
            f"Target mutation result {name} must be a lowercase SHA-256 hash.",
        )
    return value


def _semantic_target_summary(value: Any) -> dict[str, str] | None:
    if not isinstance(value, dict):
        return None
    summary: dict[str, str] = {}
    for key in (
        "type",
        "slotRef",
        "slotNodeId",
        "parentInstanceId",
        "slot",
        "anchorInstanceId",
        "relation",
    ):
        item = value.get(key)
        if isinstance(item, str) and item.strip():
            summary[key] = item
    return summary or None


def _semantic_operation_summary(operation: Any) -> dict[str, Any]:
    if not isinstance(operation, dict):
        return {"type": "unknown"}
    operation_type = operation.get("type")
    summary: dict[str, Any] = {
        "type": str(operation_type) if operation_type is not None else "unknown"
    }

    plugin = operation.get("plugin")
    replacement = operation.get("replacement")
    if operation_type in {"insert_plugin", "insert_plugin_default"} and isinstance(plugin, dict):
        for key in ("id", "pluginId"):
            value = plugin.get(key)
            if isinstance(value, str) and value.strip():
                summary["instanceId" if key == "id" else key] = value
        if operation_type == "insert_plugin":
            target = _semantic_target_summary(operation.get("target"))
            if target is not None and isinstance(target.get("type"), str):
                summary["target"] = target["type"]
        else:
            summary["placement"] = "authoring-default"
    elif operation_type == "replace_plugin":
        instance_id = operation.get("instanceId")
        if isinstance(instance_id, str) and instance_id.strip():
            summary["instanceId"] = instance_id
        if isinstance(replacement, dict):
            plugin_id = replacement.get("pluginId")
            if isinstance(plugin_id, str) and plugin_id.strip():
                summary["pluginId"] = plugin_id
    elif operation_type in {
        "execute_creator_action",
        "remove_plugin",
        "remove_plugin_default",
        "set_plugin_enabled",
        "update_plugin_props",
        "move_plugin",
        "move_plugin_to",
    }:
        if operation_type == "execute_creator_action":
            action_id = operation.get("actionId")
            if isinstance(action_id, str) and action_id.strip():
                summary["actionId"] = action_id
            return summary
        instance_id = operation.get("instanceId")
        if isinstance(instance_id, str) and instance_id.strip():
            summary["instanceId"] = instance_id
        if operation_type == "set_plugin_enabled":
            summary["enabled"] = operation.get("enabled") is True
        elif operation_type == "update_plugin_props":
            keys: list[str] = []
            values = operation.get("set")
            if isinstance(values, dict):
                keys.extend(key for key in values if isinstance(key, str))
            remove_keys = operation.get("removeKeys")
            if isinstance(remove_keys, list):
                keys.extend(key for key in remove_keys if isinstance(key, str))
            summary["keys"] = list(dict.fromkeys(keys))[:50]
        elif operation_type in {"move_plugin", "move_plugin_to"}:
            target = _semantic_target_summary(
                operation.get("target")
                if operation_type == "move_plugin"
                else operation.get("placement")
            )
            if target is not None:
                summary["target"] = target
    elif operation_type == "remove_layout_node":
        node_ref = operation.get("nodeRef")
        if isinstance(node_ref, str) and node_ref.strip():
            summary["nodeRef"] = node_ref
    elif operation_type in {"insert_layout_node", "insert_layout_relative"}:
        for key in ("parentRef", "anchorRef", "direction"):
            value = operation.get(key)
            if isinstance(value, str) and value.strip():
                summary[key] = value
        node = operation.get("node")
        if isinstance(node, dict):
            local_ref = node.get("localRef")
            if isinstance(local_ref, str) and local_ref.strip():
                summary["localRef"] = local_ref
    elif operation_type in {"update_layout_node_props", "move_layout_node", "replace_layout_node"}:
        node_ref = operation.get("nodeRef")
        if isinstance(node_ref, str) and node_ref.strip():
            summary["nodeRef"] = node_ref
        for key in ("newParentRef",):
            value = operation.get(key)
            if isinstance(value, str) and value.strip():
                summary[key] = value
        if operation_type == "update_layout_node_props":
            keys: list[str] = []
            values = operation.get("set")
            if isinstance(values, dict):
                keys.extend(key for key in values if isinstance(key, str))
            remove_keys = operation.get("removeKeys")
            if isinstance(remove_keys, list):
                keys.extend(key for key in remove_keys if isinstance(key, str))
            summary["keys"] = list(dict.fromkeys(keys))[:50]
    return summary


def semantic_operation_summary(operations: Any) -> list[dict[str, Any]]:
    if not isinstance(operations, list):
        return []
    return [_semantic_operation_summary(operation) for operation in operations[:100]]


class AppUIModelMutationService:
    """Own capture, transport, disk reconciliation, Activity, and result integrity."""

    def __init__(
        self,
        *,
        project_root: str | Path,
        project_control: ProjectControlClient,
        activity: CreatorActivityRecorder,
        mutation_coordinator: ProjectMutationCoordinator,
        runtime_diagnostics: RuntimeDiagnosticStore | None = None,
        thread_id: str | None = None,
    ) -> None:
        self.project_root = Path(project_root).resolve()
        self.project_control = project_control
        self.activity = activity
        self.mutation_coordinator = mutation_coordinator
        self.runtime_diagnostics = runtime_diagnostics
        self.thread_id = thread_id
        self.metrics = AppUIModelMutationMetrics()
        self._last_failed_signature: str | None = None
        self._consecutive_failures = 0
        self._semantic_replan_pending = False
        self.last_result: AppUIModelMutationResult | None = None

    async def mutate(
        self,
        *,
        app_ui_model_hash: str,
        operations: list[dict[str, Any]],
    ) -> AppUIModelMutationResult:
        request_index = self.metrics.begin_request(len(operations))
        semantic_replan_attempt = False
        if self._semantic_replan_pending:
            if self.metrics.semanticReplans >= MAX_SEMANTIC_COMPOSITION_REPLANS:
                self.metrics.semanticReplanLimitReached = True
                error = AppUIModelMutationError(
                    "COMPOSITION_REPLAN_LIMIT_REACHED",
                    "The one allowed semantic composition replan has already been used. Stop and report the remaining precondition failure.",
                    {
                        "semanticReplans": self.metrics.semanticReplans,
                        "maxSemanticReplans": MAX_SEMANTIC_COMPOSITION_REPLANS,
                    },
                    category="operation_precondition",
                )
                self._record_error_metrics(error)
                self._record_request(request_index, operations, error=error)
                raise error
            semantic_replan_attempt = True
            self._semantic_replan_pending = False
        try:
            result = await self._mutate(
                app_ui_model_hash=app_ui_model_hash, operations=operations
            )
        except BaseException as error:
            if semantic_replan_attempt:
                if (
                    isinstance(error, AppUIModelMutationError)
                    and error.category == "stale_state"
                ):
                    self._semantic_replan_pending = True
                else:
                    self.metrics.semanticReplans += 1
            if isinstance(error, AppUIModelMutationError):
                self._record_error_metrics(error)
            self._record_request(request_index, operations, error=error)
            raise
        if semantic_replan_attempt:
            self.metrics.semanticReplans += 1
        self.metrics.successfulRequests += 1
        self._semantic_replan_pending = False
        self.last_result = result
        self._record_request(request_index, operations, result=result)
        return result

    def _record_error_metrics(self, error: AppUIModelMutationError) -> None:
        self.metrics.errorCategories[error.category] = (
            self.metrics.errorCategories.get(error.category, 0) + 1
        )
        if error.category == "operation_precondition":
            self.metrics.semanticFailures += 1
            self._semantic_replan_pending = True
            if self.metrics.semanticReplans >= MAX_SEMANTIC_COMPOSITION_REPLANS:
                self.metrics.semanticReplanLimitReached = True
                error.recovery = {
                    "action": "stop_and_report_semantic_failure",
                    "atomicRetryAllowed": False,
                    "semanticReplans": self.metrics.semanticReplans,
                    "maxSemanticReplans": MAX_SEMANTIC_COMPOSITION_REPLANS,
                }

    def record_observation_failure(
        self, *, operations: list[dict[str, Any]], error: DomainObservationError
    ) -> None:
        # A tool request rejected before dispatch still counts as a request.
        request_index = self.metrics.begin_request(len(operations))
        category = classify_mutation_error(error.code)
        self.metrics.errorCategories[category] = (
            self.metrics.errorCategories.get(category, 0) + 1
        )
        self._record_request(request_index, operations, error=error)

    def _record_request(
        self,
        request_index: int,
        operations: list[dict[str, Any]],
        *,
        result: AppUIModelMutationResult | None = None,
        error: BaseException | None = None,
    ) -> None:
        if self.activity.logger is None:
            return
        target = result.target_result if result is not None else {}
        error_category = (
            error.category
            if isinstance(error, AppUIModelMutationError)
            else (
                classify_mutation_error(error.code)
                if isinstance(error, DomainObservationError)
                else None
            )
        )
        self.activity.logger.record(
            "app_ui_model_mutation",
            {
                "requestIndex": request_index,
                "operationCount": len(operations),
                "operationTypes": [operation.get("type") for operation in operations],
                "operationSummary": semantic_operation_summary(operations),
                "result": {"ok": result is not None, "changed": target.get("changed")},
                "changedPaths": target.get("changedPaths", []),
                **({"errorCode": getattr(error, "code", type(error).__name__)} if error is not None else {}),
                **(
                    {
                        "errorCategory": error_category,
                        "stateChanged": error.state_changed,
                        "observationStillValid": error.observation_still_valid,
                    }
                    if isinstance(error, AppUIModelMutationError)
                    else (
                        {
                            "errorCategory": error_category,
                            "stateChanged": False,
                            "observationStillValid": error_category
                            != "stale_state",
                        }
                        if isinstance(error, DomainObservationError)
                        else {}
                    )
                ),
            },
        )

    async def _mutate(
        self,
        *,
        app_ui_model_hash: str,
        operations: list[dict[str, Any]],
    ) -> AppUIModelMutationResult:
        signature = json.dumps(
            [app_ui_model_hash, operations],
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            default=str,
        )
        if signature == self._last_failed_signature and self._consecutive_failures >= 2:
            raise AppUIModelMutationError(
                "AGENT_NO_PROGRESS",
                "The same AppUIModel mutation failed twice. Inspect current state before deciding what to do next.",
            )

        try:
            result = await self._mutate_once(
                app_ui_model_hash=app_ui_model_hash,
                operations=operations,
            )
        except Exception:
            if signature == self._last_failed_signature:
                self._consecutive_failures += 1
            else:
                self._last_failed_signature = signature
                self._consecutive_failures = 1
            raise
        self._last_failed_signature = None
        self._consecutive_failures = 0
        return result

    async def _mutate_once(
        self,
        *,
        app_ui_model_hash: str,
        operations: list[dict[str, Any]],
    ) -> AppUIModelMutationResult:
        async with self.mutation_coordinator.transaction(self.project_root):
            for path in MUTABLE_PATHS:
                self.activity.capture_before(path)
            before_states = self._read_mutable_states()
            try:
                runtime_slot_widths = (
                    {}
                    if self.runtime_diagnostics is None or self.thread_id is None
                    else self.runtime_diagnostics.current_slot_widths(
                        thread_id=self.thread_id,
                        app_ui_model_hash=app_ui_model_hash,
                    )
                )
                raw_result = await self.project_control.request_app_ui_model_mutation(
                    {
                        "appUIModelHash": app_ui_model_hash,
                        "operations": operations,
                        **(
                            {"runtimeSlotWidths": runtime_slot_widths}
                            if runtime_slot_widths
                            else {}
                        ),
                    }
                )
            except ProjectControlError as error:
                actual_changed_paths, _after_states = self._reconcile(before_states)
                if actual_changed_paths:
                    self.metrics.resultMismatches += 1
                if error.code == "APP_UI_MODEL_HASH_CONFLICT":
                    self.metrics.hashConflicts += 1
                raise AppUIModelMutationError(
                    error.code,
                    str(error),
                    error.details,
                    category=(
                        "infrastructure" if actual_changed_paths else None
                    ),
                    state_changed=bool(actual_changed_paths),
                ) from error
            except Exception as error:
                actual_changed_paths, _after_states = self._reconcile(before_states)
                if actual_changed_paths:
                    self.metrics.resultMismatches += 1
                logger.exception("Unexpected ProjectControl mutation failure")
                raise AppUIModelMutationError(
                    "APP_UI_MODEL_MUTATION_FAILED",
                    "The Creator Host could not complete the AppUIModel mutation.",
                    state_changed=bool(actual_changed_paths),
                    observation_still_valid=not actual_changed_paths,
                ) from error

            actual_changed_paths, after_states = self._reconcile(before_states)
            try:
                self._validate_result(
                    raw_result,
                    requested_hash=app_ui_model_hash,
                    actual_changed_paths=actual_changed_paths,
                    after_states=after_states,
                )
            except AppUIModelMutationError as error:
                self.metrics.resultMismatches += 1
                raise error.with_disk_state(
                    state_changed=bool(actual_changed_paths)
                ) from error
            if raw_result["changed"] is False:
                self.activity.record_semantic_noop(
                    source="mutate_app_ui_model",
                    reason="already-satisfied",
                )
            return AppUIModelMutationResult(raw_result, self.activity.revision)

    def _read_mutable_states(self) -> dict[str, CreatorFileState]:
        return {
            path: read_creator_file_state(self.project_root, path)
            for path in MUTABLE_PATHS
        }

    def _reconcile(
        self, before_states: dict[str, CreatorFileState]
    ) -> tuple[set[str], dict[str, CreatorFileState]]:
        after_states = self._read_mutable_states()
        actual_changed_paths = {
            path
            for path in MUTABLE_PATHS
            if before_states[path] != after_states[path]
        }
        for path in sorted(actual_changed_paths):
            self.activity.file_observations.observe(path)
            self.activity.touch(path)
        self.metrics.changedPaths += len(actual_changed_paths)
        return actual_changed_paths, after_states

    @staticmethod
    def _validate_result(
        result: Any,
        *,
        requested_hash: str,
        actual_changed_paths: set[str],
        after_states: dict[str, CreatorFileState],
    ) -> None:
        if not isinstance(result, dict):
            raise AppUIModelMutationError(
                "APP_UI_MODEL_MUTATION_RESULT_INCONSISTENT",
                "Target mutation result must be an object.",
            )
        if result.get("schemaVersion") != 1:
            raise AppUIModelMutationError(
                "APP_UI_MODEL_MUTATION_RESULT_INCONSISTENT",
                "Target mutation result schemaVersion must be 1.",
            )
        transaction_id = result.get("transactionId")
        if not isinstance(transaction_id, str) or not transaction_id:
            raise AppUIModelMutationError(
                "APP_UI_MODEL_MUTATION_RESULT_INCONSISTENT",
                "Target mutation result transactionId must be a non-empty string.",
            )
        changed = result.get("changed")
        if not isinstance(changed, bool):
            raise AppUIModelMutationError(
                "APP_UI_MODEL_MUTATION_RESULT_INCONSISTENT",
                "Target mutation result changed must be a boolean.",
            )
        changed_paths = result.get("changedPaths")
        if not isinstance(changed_paths, list) or not all(
            isinstance(path, str) for path in changed_paths
        ):
            raise AppUIModelMutationError(
                "APP_UI_MODEL_CHANGED_PATH_INVALID",
                "Target mutation result changedPaths must be an array of strings.",
            )
        if len(set(changed_paths)) != len(changed_paths):
            raise AppUIModelMutationError(
                "APP_UI_MODEL_CHANGED_PATH_INVALID",
                "Target mutation result changedPaths contains duplicates.",
            )
        unexpected = sorted(set(changed_paths).difference(MUTABLE_PATHS))
        if unexpected:
            raise AppUIModelMutationError(
                "APP_UI_MODEL_CHANGED_PATH_INVALID",
                "Target mutation reported a path outside the AppUIModel mutation allowlist.",
                {"changedPaths": unexpected, "allowedPaths": list(MUTABLE_PATHS)},
            )
        reported_changed_paths = set(changed_paths)
        if reported_changed_paths != actual_changed_paths or changed != bool(actual_changed_paths):
            raise AppUIModelMutationError(
                "APP_UI_MODEL_CHANGED_PATHS_MISMATCH",
                "Target mutation changedPaths do not match the files changed on disk.",
                {
                    "reportedChangedPaths": sorted(reported_changed_paths),
                    "actualChangedPaths": sorted(actual_changed_paths),
                    "reportedChanged": changed,
                },
            )

        app_ui_model = _object(result.get("appUIModel"), "appUIModel")
        before_hash = _hash(app_ui_model.get("beforeHash"), "appUIModel.beforeHash")
        after_hash = _hash(app_ui_model.get("afterHash"), "appUIModel.afterHash")
        snapshot_token = _object(result.get("snapshotToken"), "snapshotToken")
        snapshot_app_hash = _hash(
            snapshot_token.get("appUIModelHash"), "snapshotToken.appUIModelHash"
        )
        snapshot_catalog_source_hash = _hash(
            snapshot_token.get("capabilityCatalogSourceHash"),
            "snapshotToken.capabilityCatalogSourceHash",
        )
        snapshot_catalog_revision = snapshot_token.get(
            "capabilityCatalogRevision"
        )
        composition_revision = result.get("compositionRevision")
        if snapshot_catalog_revision is not None:
            snapshot_catalog_revision = _hash(
                snapshot_catalog_revision,
                "snapshotToken.capabilityCatalogRevision",
            )
        if composition_revision is not None:
            composition_revision = _object(
                composition_revision, "compositionRevision"
            )
            if (
                composition_revision.get("transactionId") != transaction_id
                or _hash(
                    composition_revision.get("appUIModelHash"),
                    "compositionRevision.appUIModelHash",
                )
                != after_hash
                or _hash(
                    composition_revision.get("capabilityCatalogRevision"),
                    "compositionRevision.capabilityCatalogRevision",
                )
                != snapshot_catalog_revision
            ):
                raise AppUIModelMutationError(
                    "APP_UI_MODEL_MUTATION_RESULT_INCONSISTENT",
                    "Target CompositionRevision does not match the mutation result.",
                )
        if (
            before_hash != requested_hash
            or after_hash != snapshot_app_hash
            or after_hash != after_states[APP_UI_MODEL_PATH].hash
            or snapshot_catalog_source_hash != after_states[REGISTRY_PATH].hash
        ):
            raise AppUIModelMutationError(
                "APP_UI_MODEL_MUTATION_RESULT_INCONSISTENT",
                "Target mutation hashes do not match the request, snapshot token, and current disk state.",
                {
                    "requestedHash": requested_hash,
                    "beforeHash": before_hash,
                    "afterHash": after_hash,
                    "snapshotAppUIModelHash": snapshot_app_hash,
                    "diskAppUIModelHash": after_states[APP_UI_MODEL_PATH].hash,
                    "snapshotCapabilityCatalogSourceHash": snapshot_catalog_source_hash,
                    "diskCapabilityCatalogSourceHash": after_states[REGISTRY_PATH].hash,
                },
            )
