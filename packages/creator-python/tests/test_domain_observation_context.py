import pytest

from agent_ui_creator.domain_state import (
    DomainObservationContext,
    DomainObservationError,
)

COMPOSITION_COVERAGE = (
    "composition.model",
    "composition.layout",
    "composition.slots",
    "composition.instances",
    "capability.inventory",
    "capability.composition-summary",
    "creator.actions",
)


def test_observation_is_current_only_at_matching_activity_revision():
    observations = DomainObservationContext()
    observations.observe_app_ui_model(
        hash="a" * 64,
        revision=0,
        source="inspect_app_ui_model",
    )

    assert observations.current_hash(current_revision=0) == "a" * 64
    assert observations.current_hash(current_revision=1) is None
    with pytest.raises(DomainObservationError) as raised:
        observations.require_app_ui_model_hash(current_revision=1)

    assert raised.value.code == "APP_UI_MODEL_OBSERVATION_REQUIRED"
    assert raised.value.details == {"currentRevision": 1, "observedRevision": 0}


def test_observation_rejects_non_sha256_hash_and_tracks_invalidation():
    observations = DomainObservationContext()
    with pytest.raises(DomainObservationError) as raised:
        observations.observe_app_ui_model(
            hash="not-a-hash",
            revision=0,
            source="inspect_ui_project",
        )
    assert raised.value.code == "APP_UI_MODEL_OBSERVATION_INVALID"

    observations.observe_app_ui_model(
        hash="b" * 64,
        revision=0,
        source="inspect_ui_project",
    )
    observations.invalidate_app_ui_model(reason="hash_conflict")
    with pytest.raises(DomainObservationError) as invalidated:
        observations.require_app_ui_model_hash(current_revision=0)

    assert invalidated.value.details == {
        "currentRevision": 0,
        "invalidationReason": "hash_conflict",
    }
    assert observations.metrics.to_dict() == {
        "updates": 1,
        "hashReuses": 0,
        "invalidations": 1,
        "observationRequiredErrors": 1,
        "explicitHashMatches": 0,
        "explicitHashMismatches": 0,
        "compositionGroundingUpdates": 0,
        "coveredReadRejections": 0,
    }


def test_composition_grounding_tracks_unobserved_grounded_and_stale():
    observations = DomainObservationContext()
    assert observations.composition_grounding_status(current_revision=0) == (
        "unobserved"
    )

    observations.observe_composition_snapshot(
        hash="c" * 64,
        revision=0,
        coverage=COMPOSITION_COVERAGE,
    )

    assert observations.composition_grounding_status(current_revision=0) == (
        "grounded"
    )
    assert observations.has_fresh_coverage(
        ("composition.layout", "capability.inventory"),
        current_revision=0,
    )
    assert observations.composition_grounding_status(current_revision=1) == "stale"
    assert not observations.has_fresh_coverage(
        ("composition.layout",),
        current_revision=1,
    )
    assert observations.snapshot(current_revision=1)["compositionGrounding"][
        "status"
    ] == "stale"


def test_full_project_navigation_clears_grounding_without_losing_model_hash():
    observations = DomainObservationContext()
    observations.record_composition_snapshot_attempt()
    observations.observe_composition_snapshot(
        hash="c" * 64,
        revision=0,
        coverage=COMPOSITION_COVERAGE,
    )

    observations.clear_composition_grounding(
        reason="full_project_navigation",
        current_revision=0,
    )

    assert observations.composition_grounding_status(current_revision=0) == (
        "unobserved"
    )
    assert observations.current_hash(current_revision=0) == "c" * 64
    assert observations.snapshot(current_revision=0)[
        "compositionGroundingExitReason"
    ] == "full_project_navigation"
    assert observations.composition_fast_path_metrics.to_dict() == {
        "attempted": True,
        "eligible": True,
        "compositionSnapshots": 1,
        "fastPathExits": 1,
        "modelCallsBeforeFirstMutation": None,
        "readRoundsBeforeFirstMutation": 0,
        "readToolsBeforeFirstMutation": 0,
        "duplicateObservationAttempts": 0,
        "crossLayerReadAttemptsBeforeMutation": 0,
        "filesystemSourceReadsBeforeMutation": 0,
        "firstMutationSucceeded": None,
        "firstMutationErrorCode": None,
        "inputTokensBeforeFirstMutation": None,
        "modelLatencyBeforeFirstMutationMs": None,
    }


def test_composition_grounding_requires_complete_declared_coverage():
    observations = DomainObservationContext()
    with pytest.raises(DomainObservationError) as raised:
        observations.observe_composition_snapshot(
            hash="d" * 64,
            revision=0,
            coverage=("composition.model",),
        )
    assert raised.value.code == "COMPOSITION_OBSERVATION_INVALID"
