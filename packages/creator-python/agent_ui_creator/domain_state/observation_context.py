from __future__ import annotations

from collections.abc import Iterable
from dataclasses import asdict, dataclass
from typing import Any, Literal, cast

from .composition_fast_path import CompositionFastPathMetrics

ObservationSource = Literal[
    "inspect_ui_project",
    "inspect_app_ui_model",
    "list_ui_plugins",
    "inspect_ui_slots",
    "inspect_ui_services",
    "mutation_result",
]
CompositionGroundingStatus = Literal["unobserved", "grounded", "stale"]
ObservationCoverage = Literal[
    "composition.model",
    "composition.layout",
    "composition.slots",
    "composition.instances",
    "capability.inventory",
    "capability.composition-summary",
    "creator.actions",
]

_OBSERVATION_SOURCES = {
    "inspect_ui_project",
    "inspect_app_ui_model",
    "list_ui_plugins",
    "inspect_ui_slots",
    "inspect_ui_services",
    "mutation_result",
}
_SHA256_LENGTH = 64
_OBSERVATION_COVERAGE = {
    "composition.model",
    "composition.layout",
    "composition.slots",
    "composition.instances",
    "capability.inventory",
    "capability.composition-summary",
    "creator.actions",
}


class DomainObservationError(RuntimeError):
    code: str
    details: Any

    def __init__(self, code: str, message: str, details: Any = None) -> None:
        super().__init__(message)
        self.code = code
        self.details = details


@dataclass(frozen=True, slots=True)
class AppUIModelObservation:
    hash: str
    revision: int
    source: ObservationSource


@dataclass(frozen=True, slots=True)
class CompositionGroundingObservation:
    hash: str
    revision: int
    coverage: frozenset[ObservationCoverage]


@dataclass(slots=True)
class DomainObservationMetrics:
    updates: int = 0
    hashReuses: int = 0
    invalidations: int = 0
    observationRequiredErrors: int = 0
    explicitHashMatches: int = 0
    explicitHashMismatches: int = 0
    compositionGroundingUpdates: int = 0
    coveredReadRejections: int = 0

    def to_dict(self) -> dict[str, int]:
        return asdict(self)


def _is_sha256(value: Any) -> bool:
    return (
        isinstance(value, str)
        and len(value) == _SHA256_LENGTH
        and all(character in "0123456789abcdef" for character in value)
    )


class DomainObservationContext:
    """Run-scoped, bounded observations of authoritative domain state."""

    def __init__(self) -> None:
        self._app_ui_model: AppUIModelObservation | None = None
        self._composition_grounding: CompositionGroundingObservation | None = None
        self._composition_grounding_invalidated = False
        self._composition_grounding_exit_reason: str | None = None
        self._invalidation_reason: str | None = None
        self.metrics = DomainObservationMetrics()
        self.composition_fast_path_metrics = CompositionFastPathMetrics()

    def observe_app_ui_model(
        self,
        *,
        hash: str,
        revision: int,
        source: ObservationSource,
    ) -> None:
        if not _is_sha256(hash):
            raise DomainObservationError(
                "APP_UI_MODEL_OBSERVATION_INVALID",
                "AppUIModel observation hash must be a lowercase SHA-256 hash.",
            )
        if not isinstance(revision, int) or isinstance(revision, bool) or revision < 0:
            raise DomainObservationError(
                "APP_UI_MODEL_OBSERVATION_INVALID",
                "AppUIModel observation revision must be a non-negative integer.",
            )
        if source not in _OBSERVATION_SOURCES:
            raise DomainObservationError(
                "APP_UI_MODEL_OBSERVATION_INVALID",
                "AppUIModel observation source is unsupported.",
            )
        self._app_ui_model = AppUIModelObservation(
            hash=hash,
            revision=revision,
            source=source,
        )
        self._invalidation_reason = None
        self.metrics.updates += 1

    def observe_composition_snapshot(
        self,
        *,
        hash: str,
        revision: int,
        coverage: Iterable[str],
    ) -> None:
        normalized_values = frozenset(coverage)
        if (
            not normalized_values.issubset(_OBSERVATION_COVERAGE)
            or not _OBSERVATION_COVERAGE.issubset(normalized_values)
        ):
            raise DomainObservationError(
                "COMPOSITION_OBSERVATION_INVALID",
                "Composition observation coverage is missing or unsupported.",
            )
        normalized = cast(frozenset[ObservationCoverage], normalized_values)
        self.observe_app_ui_model(
            hash=hash,
            revision=revision,
            source="inspect_ui_project",
        )
        self._composition_grounding = CompositionGroundingObservation(
            hash=hash,
            revision=revision,
            coverage=normalized,
        )
        self._composition_grounding_invalidated = False
        self._composition_grounding_exit_reason = None
        self.metrics.compositionGroundingUpdates += 1
        self.composition_fast_path_metrics.record_snapshot()

    def record_composition_snapshot_attempt(self) -> None:
        self.composition_fast_path_metrics.record_snapshot_attempt()

    def clear_composition_grounding(
        self, *, reason: str, current_revision: int
    ) -> None:
        was_grounded = (
            self.composition_grounding_status(current_revision=current_revision)
            == "grounded"
        )
        had_grounding = self._composition_grounding is not None
        self._composition_grounding = None
        self._composition_grounding_invalidated = False
        if had_grounding:
            self._composition_grounding_exit_reason = reason
        if was_grounded:
            self.composition_fast_path_metrics.record_exit()

    def composition_grounding_status(
        self, *, current_revision: int
    ) -> CompositionGroundingStatus:
        observation = self._composition_grounding
        if observation is None:
            return "unobserved"
        if (
            self._composition_grounding_invalidated
            or observation.revision != current_revision
        ):
            return "stale"
        return "grounded"

    def has_fresh_coverage(
        self,
        required: Iterable[ObservationCoverage],
        *,
        current_revision: int,
    ) -> bool:
        observation = self._composition_grounding
        return (
            self.composition_grounding_status(current_revision=current_revision)
            == "grounded"
            and observation is not None
            and frozenset(required).issubset(observation.coverage)
        )

    def record_covered_read_rejection(self) -> None:
        self.metrics.coveredReadRejections += 1
        self.composition_fast_path_metrics.record_duplicate_observation_attempt()

    def current_hash(self, *, current_revision: int) -> str | None:
        observation = self._app_ui_model
        if observation is None or observation.revision != current_revision:
            return None
        return observation.hash

    def require_app_ui_model_hash(self, *, current_revision: int) -> str:
        observation = self._app_ui_model
        if observation is None or observation.revision != current_revision:
            self.metrics.observationRequiredErrors += 1
            details: dict[str, Any] = {"currentRevision": current_revision}
            if observation is not None:
                details["observedRevision"] = observation.revision
            if self._invalidation_reason is not None:
                details["invalidationReason"] = self._invalidation_reason
            raise DomainObservationError(
                "APP_UI_MODEL_OBSERVATION_REQUIRED",
                "No current AppUIModel observation is available. Inspect the current AppUIModel or project state before mutation.",
                details,
            )
        self.metrics.hashReuses += 1
        return observation.hash

    def verify_explicit_hash(self, explicit_hash: str, *, observed_hash: str) -> None:
        if explicit_hash == observed_hash:
            self.metrics.explicitHashMatches += 1
            return
        self.metrics.explicitHashMismatches += 1
        raise DomainObservationError(
            "APP_UI_MODEL_OBSERVATION_HASH_MISMATCH",
            "The explicit AppUIModel hash does not match the Creator Host's current observation.",
            {
                "observedHash": observed_hash,
                "providedHash": explicit_hash,
            },
        )

    def invalidate_app_ui_model(self, *, reason: str) -> None:
        self._app_ui_model = None
        self._composition_grounding_invalidated = True
        self._invalidation_reason = reason
        self.metrics.invalidations += 1

    def snapshot(self, *, current_revision: int | None = None) -> dict[str, Any]:
        observation = self._app_ui_model
        composition = self._composition_grounding
        return {
            "appUIModel": (
                None
                if observation is None
                else {
                    "hash": observation.hash,
                    "revision": observation.revision,
                    "source": observation.source,
                }
            ),
            "compositionGrounding": (
                None
                if composition is None
                else {
                    "hash": composition.hash,
                    "revision": composition.revision,
                    "coverage": sorted(composition.coverage),
                    **(
                        {
                            "status": self.composition_grounding_status(
                                current_revision=current_revision
                            )
                        }
                        if current_revision is not None
                        else {}
                    ),
                }
            ),
            **(
                {"compositionGroundingExitReason": self._composition_grounding_exit_reason}
                if self._composition_grounding_exit_reason is not None
                else {}
            ),
            **(
                {"invalidationReason": self._invalidation_reason}
                if self._invalidation_reason is not None
                else {}
            ),
            "metrics": self.metrics.to_dict(),
        }
