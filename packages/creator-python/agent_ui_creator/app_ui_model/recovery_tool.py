from __future__ import annotations

import json
from typing import Any

from langchain_core.tools import BaseTool, tool

from ..domain_state import DomainObservationContext, DomainObservationError
from ..project_control import ProjectControlError
from .mutation_tool import _bounded_error
from .mutation_service import AppUIModelMutationService


def create_app_ui_model_recovery_tool(
    service: AppUIModelMutationService, observations: DomainObservationContext,
) -> BaseTool:
    attempts: dict[str, int] = {}

    @tool("repair_app_ui_model")
    async def repair_app_ui_model(expectedRawHash: str, candidateModel: dict[str, Any]) -> str:
        """Recover only a Host-confirmed invalid AppUIModel after fresh inspect_app_ui_model_source. Supply the complete intended legal model. Preserve unaffected composition. Host admits and commits atomically. Replan an invalid candidate at most once. Stop on workspace integrity or commit failure. After success inspect_ui_project(view='composition') again; old refs and hashes are unusable."""
        try:
            observations.require_recovery(revision=service.activity.revision, raw_hash=expectedRawHash)
            if attempts.get(expectedRawHash, 0) >= 2:
                raise DomainObservationError("APP_UI_MODEL_REPAIR_REPLAN_LIMIT", "Two candidate admissions failed; stop and ask for clarification.")
            async with service.mutation_coordinator.transaction(service.project_root):
                for path in service.mutable_paths:
                    service.activity.capture_before(path)
                before = service._read_mutable_states()
                committed = False
                try:
                    result = await service.project_control.repair_app_ui_model(
                        expected_raw_hash=expectedRawHash, candidate_model=candidateModel,
                    )
                    committed = True
                finally:
                    changed, _ = service._reconcile(before)
                    if changed or committed:
                        observations.invalidate_app_ui_model(reason="app_ui_model_repaired")
                        observations.recovery_observation = None
                        observations.recovery_pending = not committed
                        observations.recovery_requires_composition = committed
            return json.dumps({"ok": True, "result": result}, ensure_ascii=False)
        except (ProjectControlError, DomainObservationError) as error:
            if error.code == "APP_UI_MODEL_REPAIR_CANDIDATE_INVALID":
                attempts[expectedRawHash] = attempts.get(expectedRawHash, 0) + 1
            elif error.code not in {"APP_UI_MODEL_RECOVERY_OBSERVATION_REQUIRED", "APP_UI_MODEL_REPAIR_REPLAN_LIMIT"}:
                observations.recovery_observation = None
            if error.code in {"APP_UI_MODEL_REPAIR_WORKSPACE_INTEGRITY", "APP_UI_MODEL_REPAIR_COMMIT_FAILED", "APP_UI_MODEL_REPAIR_REPLAN_LIMIT"}:
                observations.recovery_blocked = error.code
            category = ("stale_state" if error.code in {"APP_UI_MODEL_RECOVERY_HASH_CONFLICT", "APP_UI_MODEL_RECOVERY_OBSERVATION_REQUIRED"}
                        else "workspace_integrity" if error.code == "APP_UI_MODEL_REPAIR_WORKSPACE_INTEGRITY"
                        else "infrastructure" if error.code == "APP_UI_MODEL_REPAIR_COMMIT_FAILED"
                        else "operation_precondition")
            return _bounded_error(
                error.code, str(error), error.details, category=category,
                observation_still_valid=error.code == "APP_UI_MODEL_REPAIR_CANDIDATE_INVALID",
                recovery={"action": "replan_candidate_once" if error.code == "APP_UI_MODEL_REPAIR_CANDIDATE_INVALID"
                          else "inspect_app_ui_model_source" if category == "stale_state" else "stop"},
            )

    return repair_app_ui_model
