import pytest

from agent_ui_creator.domain_state import (
    DomainObservationContext,
    DomainObservationError,
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
    }
