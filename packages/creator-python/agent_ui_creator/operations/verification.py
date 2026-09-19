from __future__ import annotations

import asyncio
import re
from collections.abc import Mapping
from time import monotonic
from typing import Any, Protocol
from urllib.parse import quote

from ..validation import CreatorValidationService
from ..visual_observation import VisualObservationStore
from .models import CreatorOperationVerificationResult, CreatorVisualObservationEvidence


MAX_RUNTIME_FRESHNESS_ATTEMPTS = 3
RUNTIME_FRESHNESS_DELAY_SECONDS = 0.5
GEOMETRY_TOLERANCE_PX = 2.0
VISUAL_OBSERVATION_WAIT_SECONDS = 1.5
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


def resolve_runtime_plugin_slot_id(instance_id: str, slot: str) -> str:
    """Mirror the Runtime's encodeURIComponent-based Plugin Slot identity."""

    safe = "-_.!~*'()"
    return f"plugin:{quote(instance_id, safe=safe)}:{quote(slot, safe=safe)}"


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


def verify_expected_workspace_fill(
    result: Mapping[str, Any], expected: list[Mapping[str, Any]]
) -> dict[str, Any]:
    """Compare surviving Workspace instances with their resolved Row tracks."""

    if (
        result.get("runtimeStatus") != "passed"
        or result.get("compositionFresh") is not True
    ):
        return {"status": "stale", "workspaceFillVerified": None}
    nodes = result.get("runtimeLayoutNodes")
    instances = result.get("runtimeInstances")
    if not isinstance(nodes, list) or not isinstance(instances, list):
        return {"status": "unavailable", "workspaceFillVerified": None}
    row = next(
        (
            item
            for item in nodes
            if isinstance(item, Mapping)
            and item.get("nodeId") == "layout-node:root"
            and item.get("type") == "row"
        ),
        None,
    )
    widths = row.get("trackWidths") if isinstance(row, Mapping) else None
    if not isinstance(widths, list):
        return {
            "status": "unavailable",
            "workspaceFillVerified": None,
            "reason": "workspace-track-geometry-missing",
        }
    by_id = {
        item.get("instanceId"): item
        for item in instances
        if isinstance(item, Mapping) and isinstance(item.get("instanceId"), str)
    }
    checks = []
    for item in expected:
        index = item.get("trackIndex")
        instance_id = item.get("instanceId")
        if (
            not isinstance(index, int)
            or isinstance(index, bool)
            or index < 0
            or index >= len(widths)
            or not isinstance(instance_id, str)
        ):
            return {
                "status": "failed",
                "workspaceFillVerified": False,
                "reason": "expected-workspace-fill-invalid",
            }
        track_width = _number(widths[index])
        instance = by_id.get(instance_id)
        instance_rect = _rect(instance.get("rect")) if isinstance(instance, Mapping) else None
        if track_width is None or instance_rect is None:
            return {
                "status": "unavailable",
                "workspaceFillVerified": None,
                "reason": "workspace-instance-geometry-missing",
            }
        checks.append({
            "instanceId": instance_id,
            "region": item.get("region"),
            "trackWidth": track_width,
            "instanceWidth": instance_rect["width"],
            "verified": abs(instance_rect["width"] - track_width) <= GEOMETRY_TOLERANCE_PX,
        })
    verified = bool(checks) and all(item["verified"] for item in checks)
    return {
        "status": "passed" if verified else "failed",
        "workspaceFillVerified": verified,
        "checks": checks,
    }


def verify_expected_relative_placement(
    result: Mapping[str, Any], expected: Mapping[str, Any]
) -> dict[str, Any]:
    """Verify that a moved Plugin is on the requested side without overlap."""

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
            "placementVerified": None,
            "geometryVerified": None,
        }

    instance_items = result.get("runtimeInstances", result.get("instances"))
    if not isinstance(instance_items, list):
        return {
            "status": "unavailable",
            "placementVerified": None,
            "geometryVerified": None,
        }
    by_id = {
        item.get("instanceId"): item
        for item in instance_items
        if isinstance(item, Mapping) and isinstance(item.get("instanceId"), str)
    }
    instance_id = expected.get("instanceId")
    anchor_id = expected.get("anchorInstanceId")
    relation = expected.get("relation")
    if (
        expected.get("type") != "relative"
        or not isinstance(instance_id, str)
        or not isinstance(anchor_id, str)
        or relation not in {"before", "after"}
    ):
        return {
            "status": "failed",
            "placementVerified": False,
            "geometryVerified": False,
            "reason": "expected-placement-invalid",
        }

    candidate = _rect(by_id.get(instance_id, {}).get("rect"))
    anchor = _rect(by_id.get(anchor_id, {}).get("rect"))
    if candidate is None or anchor is None:
        return {
            "status": "unavailable",
            "placementVerified": None,
            "geometryVerified": None,
            "reason": "expected-instance-geometry-missing",
        }

    if relation == "before":
        verified = candidate["x"] + candidate["width"] <= (
            anchor["x"] + GEOMETRY_TOLERANCE_PX
        )
    else:
        verified = candidate["x"] >= (
            anchor["x"] + anchor["width"] - GEOMETRY_TOLERANCE_PX
        )
    return {
        "status": "passed" if verified else "failed",
        "placementVerified": verified,
        "geometryVerified": verified,
        "instanceId": instance_id,
        "anchorInstanceId": anchor_id,
        "relation": relation,
    }


def verify_expected_plugin_slot_placement(
    result: Mapping[str, Any], expected: Mapping[str, Any]
) -> dict[str, Any]:
    """Verify a moved Plugin is mounted in the expected Runtime Plugin Slot."""

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
            "placementVerified": None,
            "geometryVerified": None,
        }

    instance_items = result.get("runtimeInstances", result.get("instances"))
    if not isinstance(instance_items, list):
        return {
            "status": "unavailable",
            "placementVerified": None,
            "geometryVerified": None,
        }
    instance_id = expected.get("instanceId")
    parent_instance_id = expected.get("parentInstanceId")
    slot = expected.get("slot")
    if (
        expected.get("type") != "plugin_slot"
        or not isinstance(instance_id, str)
        or not isinstance(parent_instance_id, str)
        or not isinstance(slot, str)
    ):
        return {
            "status": "failed",
            "placementVerified": False,
            "geometryVerified": None,
            "reason": "expected-placement-invalid",
        }

    target = next(
        (
            item
            for item in instance_items
            if isinstance(item, Mapping) and item.get("instanceId") == instance_id
        ),
        None,
    )
    if not isinstance(target, Mapping):
        return {
            "status": "failed",
            "placementVerified": False,
            "geometryVerified": None,
            "reason": "expected-instance-missing",
        }

    expected_slot_id = resolve_runtime_plugin_slot_id(parent_instance_id, slot)
    verified = target.get("slotId") == expected_slot_id
    return {
        "status": "passed" if verified else "failed",
        "placementVerified": verified,
        "geometryVerified": None,
        "instanceId": instance_id,
        "parentInstanceId": parent_instance_id,
        "slot": slot,
        "expectedSlotId": expected_slot_id,
    }


class CompositionOperationVerificationService:
    """Verify Productized composition mutations without the Agent tool loop."""

    def __init__(
        self,
        *,
        validation: CreatorValidationService,
        runtime: RuntimeInspectionForOperation,
        visual_observations: VisualObservationStore | None = None,
    ) -> None:
        self.validation = validation
        self.runtime = runtime
        self.visual_observations = visual_observations

    async def _visual_evidence(self, expected_hash: str) -> dict[str, Any]:
        store = self.visual_observations
        if store is None:
            return {"visualObservationStatus": "unavailable"}
        deadline = monotonic() + VISUAL_OBSERVATION_WAIT_SECONDS
        while True:
            try:
                observation = store.get_by_hash(expected_hash)
            except Exception:
                return {"visualObservationStatus": "unavailable"}
            if observation is not None:
                if observation.get("currentHash") != expected_hash:
                    return {"visualObservationStatus": "stale"}
                try:
                    evidence = CreatorVisualObservationEvidence.model_validate({
                        key: observation[key]
                        for key in ("observationId", "currentHash", "format", "width", "height", "sha256")
                    })
                except Exception:
                    return {"visualObservationStatus": "unavailable"}
                timings = {
                    "visualObservationCaptureDurationMs": observation.get("captureDurationMs"),
                    "visualObservationUploadDurationMs": observation.get("uploadDurationMs"),
                    "visualObservationBytes": observation.get("visualObservationBytes"),
                }
                if any(value is not None and (not isinstance(value, int) or value < 0) for value in timings.values()):
                    timings = {key: None for key in timings}
                return {
                    "visualObservationStatus": "observed",
                    "visualObservation": evidence,
                    **timings,
                }
            remaining = deadline - monotonic()
            if remaining <= 0:
                return {"visualObservationStatus": "unavailable"}
            await asyncio.sleep(min(0.15, remaining))

    async def ensure_baseline(self) -> None:
        """Capture the validation baseline before a Productized side effect."""

        await self.validation.ensure_baseline()

    async def verify(
        self,
        *,
        mutation_result: Mapping[str, Any],
        expected_runtime: Mapping[str, Any],
        expected_geometry: Mapping[str, Any] | None = None,
        expected_placement: Mapping[str, Any] | None = None,
        expected_workspace_fill: list[Mapping[str, Any]] | None = None,
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
            placement_expected = expected_placement is not None
            relative_expected = (
                placement_expected and expected_placement.get("type") == "relative"
            )
            return CreatorOperationVerificationResult(
                staticStatus="passed",
                runtimeStatus="failed",
                runtimeFreshnessAttempts=attempts,
                runtimeFreshnessWaitMs=wait_ms,
                presentInstancesVerified=present_verified,
                absentInstancesVerified=absent_verified,
                placementVerified=False if placement_expected else None,
                geometryVerified=False if relative_expected else None,
                compositionVerified=(
                    composition_verified
                    if isinstance(composition_verified, bool)
                    else None
                ),
            )

        placement_verified: bool | None = None
        geometry_verified: bool | None = None
        if expected_placement is not None:
            placement_type = expected_placement.get("type")
            if placement_type == "relative":
                placement = verify_expected_relative_placement(
                    result, expected_placement
                )
            elif placement_type == "plugin_slot":
                placement = verify_expected_plugin_slot_placement(
                    result, expected_placement
                )
            else:
                placement = {
                    "status": "failed",
                    "placementVerified": False,
                    "geometryVerified": None,
                }
            placement_verified = placement.get("placementVerified")
            geometry_verified = placement.get("geometryVerified")
            if placement.get("status") == "failed":
                return CreatorOperationVerificationResult(
                    staticStatus="passed",
                    runtimeStatus="failed",
                    runtimeFreshnessAttempts=attempts,
                    runtimeFreshnessWaitMs=wait_ms,
                    presentInstancesVerified=present_verified,
                    absentInstancesVerified=absent_verified,
                    placementVerified=False,
                    geometryVerified=(
                        geometry_verified
                        if isinstance(geometry_verified, bool)
                        else None
                    ),
                    compositionVerified=(
                        composition_verified
                        if isinstance(composition_verified, bool)
                        else None
                    ),
                )
            if placement.get("status") in {"stale", "unavailable"}:
                return CreatorOperationVerificationResult(
                    staticStatus="passed",
                    runtimeStatus=(
                        "stale"
                        if placement.get("status") == "stale"
                        else "unavailable"
                    ),
                    runtimeFreshnessAttempts=attempts,
                    runtimeFreshnessWaitMs=wait_ms,
                    presentInstancesVerified=present_verified,
                    absentInstancesVerified=absent_verified,
                    placementVerified=None,
                    geometryVerified=None,
                    compositionVerified=(
                        composition_verified
                        if isinstance(composition_verified, bool)
                        else None
                    ),
                )
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
                    placementVerified=placement_verified,
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
                    placementVerified=placement_verified,
                    geometryVerified=None,
                    compositionVerified=(
                        composition_verified
                        if isinstance(composition_verified, bool)
                        else None
                    ),
                )

        workspace_fill_verified: bool | None = None
        if expected_workspace_fill is not None:
            fill = verify_expected_workspace_fill(result, expected_workspace_fill)
            workspace_fill_verified = fill.get("workspaceFillVerified")
            if fill["status"] != "passed":
                return CreatorOperationVerificationResult(
                    staticStatus="passed",
                    runtimeStatus=(
                        "failed" if fill["status"] == "failed" else "unavailable"
                    ),
                    runtimeFreshnessAttempts=attempts,
                    runtimeFreshnessWaitMs=wait_ms,
                    presentInstancesVerified=present_verified,
                    absentInstancesVerified=absent_verified,
                    placementVerified=placement_verified,
                    geometryVerified=geometry_verified,
                    workspaceFillVerified=workspace_fill_verified,
                    compositionVerified=(
                        composition_verified
                        if isinstance(composition_verified, bool)
                        else None
                    ),
                )

        visual_evidence = await self._visual_evidence(expected_hash)
        return CreatorOperationVerificationResult(
            staticStatus="passed",
            runtimeStatus="passed",
            runtimeFreshnessAttempts=attempts,
            runtimeFreshnessWaitMs=wait_ms,
            presentInstancesVerified=present_verified,
            absentInstancesVerified=absent_verified,
            placementVerified=placement_verified,
            geometryVerified=geometry_verified,
            workspaceFillVerified=workspace_fill_verified,
            compositionVerified=(
                composition_verified
                if isinstance(composition_verified, bool)
                else None
            ),
            **visual_evidence,
        )
