from __future__ import annotations

import asyncio
from collections.abc import Mapping
from time import monotonic
from typing import Any

from ..activity import CreatorActivityRecorder
from ..app_ui_model import AppUIModelMutationService
from ..domain_state import CompositionFastPathMetrics
from ..operations.verification import (
    GEOMETRY_TOLERANCE_PX,
    MAX_RUNTIME_FRESHNESS_ATTEMPTS,
    RUNTIME_FRESHNESS_DELAY_SECONDS,
    verify_expected_geometry,
)
from ..runtime_diagnostics import RuntimeDiagnosticInspectionService
from ..validation import CreatorValidationService
from ..verification_policy import (
    CreatorVerificationMode,
    DEFAULT_CREATOR_VERIFICATION_MODE,
)


class CompositionVerificationTail:
    """Run Host-owned post-mutation evidence without another model tool turn."""

    def __init__(
        self,
        *,
        activity: CreatorActivityRecorder,
        validation: CreatorValidationService,
        runtime: RuntimeDiagnosticInspectionService,
        metrics: CompositionFastPathMetrics,
        verification_mode: CreatorVerificationMode = DEFAULT_CREATOR_VERIFICATION_MODE,
    ) -> None:
        self.activity = activity
        self.validation = validation
        self.runtime = runtime
        self.metrics = metrics
        self.verification_mode = verification_mode
        self._last_revision: int | None = None
        self._last_result: dict[str, Any] | None = None

    @staticmethod
    def _expected_geometry(target_result: Mapping[str, Any]) -> Mapping[str, Any] | None:
        semantic = target_result.get("semanticComposition")
        if not isinstance(semantic, Mapping):
            return None
        expected = semantic.get("expectedGeometry")
        return expected if isinstance(expected, Mapping) else None

    _verify_geometry = staticmethod(verify_expected_geometry)

    async def run_if_needed(
        self, mutation_service: AppUIModelMutationService
    ) -> dict[str, Any] | None:
        mutation = mutation_service.last_result
        if mutation is None:
            return None
        target_result = mutation.target_result
        revision = mutation.mutation_revision
        if (
            not isinstance(target_result, Mapping)
            or target_result.get("changed") is not True
            or revision != self.activity.revision
        ):
            return None
        semantic = target_result.get("semanticComposition")
        if (
            not isinstance(semantic, Mapping)
            or semantic.get("operation") != "insert_plugin_default"
        ):
            return None
        if self._last_revision == revision:
            return self._last_result

        tail: dict[str, Any] = {
            "verificationTailRan": True,
            "mutationRevision": revision,
            "verificationMode": self.verification_mode,
            "runtimeFreshnessAttempts": 0,
            "runtimeFreshnessWaitMs": 0,
            "geometryVerified": None,
        }
        try:
            validation = await self.validation.validate(mode="delta")
        except Exception as error:  # pragma: no cover - defensive Host boundary
            validation = None
            tail["staticValidationStatus"] = "failed"
            tail["staticValidationError"] = type(error).__name__
        else:
            tail["staticValidationStatus"] = validation.status
            tail["staticValidationRevision"] = validation.revision

        if validation is None or validation.status != "passed":
            tail["runtimeStatus"] = "not-run"
            tail["verificationMode"] = self.verification_mode
            self.metrics.record_verification_tail(tail)
            self._publish(tail, runtime_result=None)
            return tail

        if self.verification_mode == "static_only":
            tail["runtimeStatus"] = "not-run"
            tail["verificationMode"] = self.verification_mode
            self.metrics.record_verification_tail(tail)
            self._publish(tail, runtime_result=None)
            return tail

        started_wait = monotonic()
        runtime_result: dict[str, Any] | None = None
        for attempt in range(1, MAX_RUNTIME_FRESHNESS_ATTEMPTS + 1):
            if attempt > 1:
                await asyncio.sleep(RUNTIME_FRESHNESS_DELAY_SECONDS)
            tail["runtimeFreshnessAttempts"] = attempt
            try:
                runtime_result = await self.runtime.inspect()
            except Exception as error:  # pragma: no cover - defensive Host boundary
                runtime_result = {
                    "available": False,
                    "runtimeStatus": "unavailable",
                    "runtimeObserved": False,
                    "compositionFresh": False,
                    "currentErrors": [],
                    "resolvedCurrent": [],
                    "stale": [],
                    "summary": {"currentOpenCount": 0},
                    "verificationError": type(error).__name__,
                }
            runtime_status = runtime_result.get("runtimeStatus")
            if runtime_status not in {"stale", "unavailable"}:
                break
        tail["runtimeFreshnessWaitMs"] = round(
            (monotonic() - started_wait) * 1000
        )
        runtime_result = runtime_result or {
            "available": False,
            "runtimeStatus": "unavailable",
            "runtimeObserved": False,
            "compositionFresh": False,
            "currentErrors": [],
            "resolvedCurrent": [],
            "stale": [],
            "summary": {"currentOpenCount": 0},
        }
        runtime_status = str(runtime_result.get("runtimeStatus", "unavailable"))
        tail["runtimeStatus"] = runtime_status
        tail["freshnessExhausted"] = runtime_status in {"stale", "unavailable"}

        expected = self._expected_geometry(target_result)
        if runtime_status == "passed" and expected is not None:
            try:
                geometry_result = await self.runtime.inspect_layout(
                    instance_ids=[
                        str(expected["instanceId"]),
                        str(expected["anchorInstanceId"]),
                    ]
                )
                geometry = self._verify_geometry(geometry_result, expected)
            except Exception as error:  # pragma: no cover - defensive Host boundary
                geometry = {
                    "status": "unavailable",
                    "geometryVerified": None,
                    "reason": type(error).__name__,
                }
            tail["geometryVerification"] = geometry
            tail["geometryVerified"] = geometry.get("geometryVerified")
            if geometry.get("status") == "failed":
                runtime_status = "failed"
                runtime_result = dict(runtime_result)
                runtime_result["runtimeStatus"] = "failed"
            elif geometry.get("status") in {"stale", "unavailable"}:
                runtime_status = str(geometry["status"])
                runtime_result = dict(runtime_result)
                runtime_result["runtimeStatus"] = runtime_status
            tail["runtimeStatus"] = runtime_status
            tail["freshnessExhausted"] = runtime_status in {"stale", "unavailable"}

        self.metrics.record_verification_tail(tail)
        self._publish(tail, runtime_result=runtime_result)
        return tail

    def _publish(
        self,
        tail: dict[str, Any],
        *,
        runtime_result: dict[str, Any] | None,
    ) -> None:
        self.runtime.publish_host_verification(
            tail,
            runtime_result=runtime_result,
        )
        self._last_revision = self.activity.revision
        self._last_result = dict(tail)
        if self.activity.logger is not None:
            self.activity.logger.record(
                "composition_verification_tail",
                dict(tail),
            )
