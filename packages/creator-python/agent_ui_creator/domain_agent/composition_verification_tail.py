from __future__ import annotations

import asyncio
import re
from collections.abc import Mapping
from time import monotonic
from typing import Any

from ..activity import CreatorActivityRecorder
from ..app_ui_model import AppUIModelMutationService
from ..domain_state import CompositionFastPathMetrics
from ..runtime_diagnostics import RuntimeDiagnosticInspectionService
from ..validation import CreatorValidationService


MAX_RUNTIME_FRESHNESS_ATTEMPTS = 3
RUNTIME_FRESHNESS_DELAY_SECONDS = 0.5
GEOMETRY_TOLERANCE_PX = 2.0
_PIXEL_SIZE = re.compile(r"^\s*([0-9]+(?:\.[0-9]+)?)px\s*$", re.IGNORECASE)


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


def _rect(value: Any) -> dict[str, float] | None:
    if not isinstance(value, Mapping):
        return None
    values = {key: _number(value.get(key)) for key in ("x", "y", "width", "height")}
    if any(item is None for item in values.values()):
        return None
    if values["width"] <= 0 or values["height"] <= 0:
        return None
    return {key: float(item) for key, item in values.items() if item is not None}


class CompositionVerificationTail:
    """Run Host-owned post-mutation evidence without another model tool turn."""

    def __init__(
        self,
        *,
        activity: CreatorActivityRecorder,
        validation: CreatorValidationService,
        runtime: RuntimeDiagnosticInspectionService,
        metrics: CompositionFastPathMetrics,
    ) -> None:
        self.activity = activity
        self.validation = validation
        self.runtime = runtime
        self.metrics = metrics
        self._last_revision: int | None = None
        self._last_result: dict[str, Any] | None = None

    @staticmethod
    def _expected_geometry(target_result: Mapping[str, Any]) -> Mapping[str, Any] | None:
        semantic = target_result.get("semanticComposition")
        if not isinstance(semantic, Mapping):
            return None
        expected = semantic.get("expectedGeometry")
        return expected if isinstance(expected, Mapping) else None

    @staticmethod
    def _verify_geometry(
        result: Mapping[str, Any], expected: Mapping[str, Any]
    ) -> dict[str, Any]:
        if (
            result.get("runtimeStatus") != "available"
            or result.get("compositionFresh") is not True
        ):
            return {
                "status": (
                    "stale"
                    if result.get("runtimeStatus") == "stale"
                    or result.get("compositionFresh") is not True
                    else "unavailable"
                ),
                "geometryVerified": None,
            }

        instance_items = result.get("instances")
        if not isinstance(instance_items, list):
            return {"status": "unavailable", "geometryVerified": None}
        by_id = {
            item.get("instanceId"): item
            for item in instance_items
            if isinstance(item, Mapping) and isinstance(item.get("instanceId"), str)
        }
        instance_id = expected.get("instanceId")
        anchor_id = expected.get("anchorInstanceId")
        relation = expected.get("relation")
        axis = expected.get("axis")
        expected_size_value = expected.get("size")
        if not isinstance(expected_size_value, str) or not expected_size_value.strip():
            return {
                "status": "failed",
                "geometryVerified": False,
                "reason": "expected-geometry-invalid",
            }
        size_match = _PIXEL_SIZE.match(expected_size_value)
        if (
            not isinstance(instance_id, str)
            or not isinstance(anchor_id, str)
            or relation not in {"before", "after", "above", "below"}
            or axis not in {"width", "height"}
        ):
            return {
                "status": "failed",
                "geometryVerified": False,
                "reason": "expected-geometry-invalid",
            }
        candidate = _rect(by_id.get(instance_id, {}).get("rect"))
        anchor = _rect(by_id.get(anchor_id, {}).get("rect"))
        if candidate is None or anchor is None:
            return {
                "status": "unavailable",
                "geometryVerified": None,
                "reason": "expected-instance-geometry-missing",
            }

        expected_size = None if size_match is None else float(size_match.group(1))
        actual_size = candidate[axis]
        size_ok = (
            True
            if size_match is None
            else abs(actual_size - expected_size) <= GEOMETRY_TOLERANCE_PX
        )
        if relation == "before":
            relation_ok = candidate["x"] < anchor["x"]
        elif relation == "after":
            relation_ok = candidate["x"] > anchor["x"]
        elif relation == "above":
            relation_ok = candidate["y"] < anchor["y"]
        else:
            relation_ok = candidate["y"] > anchor["y"]
        verified = size_ok and relation_ok
        return {
            "status": "passed" if verified else "failed",
            "geometryVerified": verified,
            "instanceId": instance_id,
            "anchorInstanceId": anchor_id,
            "relation": relation,
            "axis": axis,
            "actualSize": actual_size,
            "sizeCheck": (
                "not-applicable"
                if size_match is None
                else "passed" if size_ok else "failed"
            ),
            **({"expectedSize": expected_size} if size_match is not None else {}),
        }

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
