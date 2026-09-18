from __future__ import annotations

import asyncio
import re
from collections.abc import Mapping
from time import monotonic
from typing import Any, Protocol

from ..validation import CreatorValidationService
from .models import CreatorOperationVerificationResult


MAX_RUNTIME_FRESHNESS_ATTEMPTS = 3
RUNTIME_FRESHNESS_DELAY_SECONDS = 0.5
GEOMETRY_TOLERANCE_PX = 2.0
_PIXEL_SIZE = re.compile(r"^\s*([0-9]+(?:\.[0-9]+)?)px\s*$", re.IGNORECASE)


class RuntimeInspectionForOperation(Protocol):
    async def inspect_host(self) -> dict[str, Any]: ...

    async def inspect(self) -> dict[str, Any]: ...


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


def verify_expected_geometry(
    result: Mapping[str, Any], expected: Mapping[str, Any]
) -> dict[str, Any]:
    """Verify the existing Host geometry contract with a two-pixel tolerance."""

    if (
        result.get("runtimeStatus") not in {"passed", "available"}
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

    instance_items = result.get("runtimeInstances", result.get("instances"))
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


class CompositionOperationVerificationService:
    """Verify Productized composition mutations without the Agent tool loop."""

    def __init__(
        self,
        *,
        validation: CreatorValidationService,
        runtime: RuntimeInspectionForOperation,
    ) -> None:
        self.validation = validation
        self.runtime = runtime

    async def ensure_baseline(self) -> None:
        """Capture the validation baseline before a Productized side effect."""

        await self.validation.ensure_baseline()

    async def verify(
        self,
        *,
        mutation_result: Mapping[str, Any],
        expected_runtime: Mapping[str, Any],
        expected_geometry: Mapping[str, Any] | None = None,
    ) -> CreatorOperationVerificationResult:
        try:
            validation = await self.validation.validate(mode="delta")
        except Exception:
            return CreatorOperationVerificationResult(
                staticStatus="failed",
                runtimeStatus="not-run",
                runtimeFreshnessAttempts=0,
                runtimeFreshnessWaitMs=0,
            )

        if getattr(validation, "status", None) != "passed":
            return CreatorOperationVerificationResult(
                staticStatus="failed",
                runtimeStatus="not-run",
                runtimeFreshnessAttempts=0,
                runtimeFreshnessWaitMs=0,
            )

        started_at = monotonic()
        runtime_result: dict[str, Any] | None = None
        attempts = 0
        for attempt in range(1, MAX_RUNTIME_FRESHNESS_ATTEMPTS + 1):
            if attempt > 1:
                await asyncio.sleep(RUNTIME_FRESHNESS_DELAY_SECONDS)
            attempts = attempt
            try:
                inspect_host = getattr(self.runtime, "inspect_host", None)
                runtime_result = (
                    await inspect_host()
                    if callable(inspect_host)
                    else await self.runtime.inspect()
                )
            except Exception:
                runtime_result = {
                    "runtimeStatus": "unavailable",
                    "compositionFresh": False,
                    "runtimeInstances": [],
                    "currentErrors": [],
                }
            runtime_status = runtime_result.get("runtimeStatus")
            if runtime_status not in {"stale", "unavailable"} and runtime_result.get(
                "compositionFresh"
            ) is True:
                break

        wait_ms = round((monotonic() - started_at) * 1_000)
        result = runtime_result or {
            "runtimeStatus": "unavailable",
            "compositionFresh": False,
            "runtimeInstances": [],
            "currentErrors": [],
        }
        runtime_status = str(result.get("runtimeStatus", "unavailable"))
        if runtime_status in {"stale", "unavailable"} or result.get(
            "compositionFresh"
        ) is not True:
            return CreatorOperationVerificationResult(
                staticStatus="passed",
                runtimeStatus=(
                    runtime_status
                    if runtime_status in {"stale", "unavailable"}
                    else "unavailable"
                ),
                runtimeFreshnessAttempts=attempts,
                runtimeFreshnessWaitMs=wait_ms,
            )

        mutation_model = mutation_result.get("appUIModel")
        expected_hash = (
            mutation_model.get("afterHash")
            if isinstance(mutation_model, Mapping)
            else None
        )
        current_hash = result.get("currentHash")
        if (
            not isinstance(expected_hash, str)
            or not isinstance(current_hash, str)
            or current_hash != expected_hash
        ):
            return CreatorOperationVerificationResult(
                staticStatus="passed",
                runtimeStatus="failed",
                runtimeFreshnessAttempts=attempts,
                runtimeFreshnessWaitMs=wait_ms,
                compositionVerified=False,
            )

        current_errors = result.get("currentErrors")
        composition_verified = result.get("compositionVerified")
        if current_errors or composition_verified is False or runtime_status == "failed":
            return CreatorOperationVerificationResult(
                staticStatus="passed",
                runtimeStatus="failed",
                runtimeFreshnessAttempts=attempts,
                runtimeFreshnessWaitMs=wait_ms,
                compositionVerified=(
                    composition_verified
                    if isinstance(composition_verified, bool)
                    else None
                ),
            )

        instance_items = result.get("runtimeInstances", result.get("instances"))
        instance_ids = {
            item.get("instanceId")
            for item in instance_items or []
            if isinstance(item, Mapping) and isinstance(item.get("instanceId"), str)
        }
        expected_present = [
            item
            for item in expected_runtime.get("presentInstanceIds", [])
            if isinstance(item, str)
        ]
        expected_absent = [
            item
            for item in expected_runtime.get("absentInstanceIds", [])
            if isinstance(item, str)
        ]
        present_verified = [item for item in expected_present if item in instance_ids]
        absent_verified = [item for item in expected_absent if item not in instance_ids]
        if len(present_verified) != len(expected_present) or len(
            absent_verified
        ) != len(expected_absent):
            return CreatorOperationVerificationResult(
                staticStatus="passed",
                runtimeStatus="failed",
                runtimeFreshnessAttempts=attempts,
                runtimeFreshnessWaitMs=wait_ms,
                presentInstancesVerified=present_verified,
                absentInstancesVerified=absent_verified,
                compositionVerified=(
                    composition_verified
                    if isinstance(composition_verified, bool)
                    else None
                ),
            )

        geometry_verified: bool | None = None
        if expected_geometry is not None:
            geometry = verify_expected_geometry(result, expected_geometry)
            geometry_verified = geometry.get("geometryVerified")
            if geometry.get("status") == "failed":
                return CreatorOperationVerificationResult(
                    staticStatus="passed",
                    runtimeStatus="failed",
                    runtimeFreshnessAttempts=attempts,
                    runtimeFreshnessWaitMs=wait_ms,
                    presentInstancesVerified=present_verified,
                    absentInstancesVerified=absent_verified,
                    geometryVerified=False,
                    compositionVerified=(
                        composition_verified
                        if isinstance(composition_verified, bool)
                        else None
                    ),
                )
            if geometry.get("status") in {"stale", "unavailable"}:
                return CreatorOperationVerificationResult(
                    staticStatus="passed",
                    runtimeStatus=(
                        "stale"
                        if geometry.get("status") == "stale"
                        else "unavailable"
                    ),
                    runtimeFreshnessAttempts=attempts,
                    runtimeFreshnessWaitMs=wait_ms,
                    presentInstancesVerified=present_verified,
                    absentInstancesVerified=absent_verified,
                    geometryVerified=None,
                    compositionVerified=(
                        composition_verified
                        if isinstance(composition_verified, bool)
                        else None
                    ),
                )

        return CreatorOperationVerificationResult(
            staticStatus="passed",
            runtimeStatus="passed",
            runtimeFreshnessAttempts=attempts,
            runtimeFreshnessWaitMs=wait_ms,
            presentInstancesVerified=present_verified,
            absentInstancesVerified=absent_verified,
            geometryVerified=geometry_verified,
            compositionVerified=(
                composition_verified
                if isinstance(composition_verified, bool)
                else None
            ),
        )
