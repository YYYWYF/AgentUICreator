from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from ..activity import CreatorActivityRecorder
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
)

_HASH_LENGTH = 64
logger = logging.getLogger(__name__)


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


class AppUIModelMutationService:
    """Own capture, transport, disk reconciliation, Activity, and result integrity."""

    def __init__(
        self,
        *,
        project_root: str | Path,
        project_control: ProjectControlClient,
        activity: CreatorActivityRecorder,
        mutation_coordinator: ProjectMutationCoordinator,
    ) -> None:
        self.project_root = Path(project_root).resolve()
        self.project_control = project_control
        self.activity = activity
        self.mutation_coordinator = mutation_coordinator
        self.metrics = AppUIModelMutationMetrics()
        self._last_failed_signature: str | None = None
        self._consecutive_failures = 0

    async def mutate(
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
            self.metrics.requests += 1
            self.metrics.operations += len(operations)
            try:
                raw_result = await self.project_control.request_app_ui_model_mutation(
                    {
                        "appUIModelHash": app_ui_model_hash,
                        "operations": operations,
                    }
                )
            except ProjectControlError as error:
                actual_changed_paths, _after_states = self._reconcile(before_states)
                if actual_changed_paths:
                    self.metrics.resultMismatches += 1
                if error.code == "APP_UI_MODEL_HASH_CONFLICT":
                    self.metrics.hashConflicts += 1
                raise AppUIModelMutationError(
                    error.code, str(error), error.details
                ) from error
            except Exception as error:
                actual_changed_paths, _after_states = self._reconcile(before_states)
                if actual_changed_paths:
                    self.metrics.resultMismatches += 1
                logger.exception("Unexpected ProjectControl mutation failure")
                raise AppUIModelMutationError(
                    "APP_UI_MODEL_MUTATION_FAILED",
                    "The Creator Host could not complete the AppUIModel mutation.",
                ) from error

            actual_changed_paths, after_states = self._reconcile(before_states)
            try:
                self._validate_result(
                    raw_result,
                    requested_hash=app_ui_model_hash,
                    actual_changed_paths=actual_changed_paths,
                    after_states=after_states,
                )
            except AppUIModelMutationError:
                self.metrics.resultMismatches += 1
                raise
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
        snapshot_registry_hash = _hash(
            snapshot_token.get("registryHash"), "snapshotToken.registryHash"
        )
        if (
            before_hash != requested_hash
            or after_hash != snapshot_app_hash
            or after_hash != after_states[APP_UI_MODEL_PATH].hash
            or snapshot_registry_hash != after_states[REGISTRY_PATH].hash
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
                    "snapshotRegistryHash": snapshot_registry_hash,
                    "diskRegistryHash": after_states[REGISTRY_PATH].hash,
                },
            )
