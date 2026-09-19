from __future__ import annotations

import asyncio
import base64
from types import SimpleNamespace

from fastapi.testclient import TestClient

from agent_ui_creator.config import CreatorServerSettings
from agent_ui_creator.operations import CompositionOperationVerificationService
from agent_ui_creator.server import create_app
from agent_ui_creator.visual_observation import (
    MAX_VISUAL_OBSERVATION_REQUEST_BYTES,
    VisualObservationEnvelope,
    VisualObservationStore,
)


HASH_A = "a" * 64
HASH_B = "b" * 64
WEBP = b"RIFF\x04\x00\x00\x00WEBP"


def payload(current_hash: str) -> dict:
    return {
        "currentHash": current_hash,
        "capturedAt": "2026-09-19T00:00:00Z",
        "viewport": {"width": 1200, "height": 720, "devicePixelRatio": 1},
        "image": {
            "format": "webp", "width": 900, "height": 720,
            "data": base64.b64encode(WEBP).decode(),
        },
        "captureDurationMs": 12,
        "imageBytes": len(WEBP),
    }


class _Validation:
    async def validate(self, *, mode: str):
        assert mode == "delta"
        return SimpleNamespace(status="passed")


class _Runtime:
    def __init__(self, current_hash: str) -> None:
        self.current_hash = current_hash

    async def inspect_host(self) -> dict:
        return {
            "runtimeStatus": "passed", "compositionFresh": True,
            "compositionVerified": True, "currentHash": self.current_hash,
            "currentErrors": [], "runtimeInstances": [],
        }


def verify(current_hash: str, store) -> object:
    return asyncio.run(CompositionOperationVerificationService(
        validation=_Validation(), runtime=_Runtime(current_hash),
        visual_observations=store,
    ).verify(
        mutation_result={"appUIModel": {"afterHash": current_hash}},
        expected_runtime={"presentInstanceIds": [], "absentInstanceIds": []},
    ))


def test_hash_bound_store_survives_late_a_and_deduplicates(tmp_path):
    store = VisualObservationStore(tmp_path)
    observation_b = store.record(VisualObservationEnvelope.model_validate(payload(HASH_B)))
    observation_a = store.record(VisualObservationEnvelope.model_validate(payload(HASH_A)))
    assert store.get_by_hash(HASH_B) == observation_b
    assert store.get_by_hash(HASH_A) == observation_a
    assert store.record(VisualObservationEnvelope.model_validate(payload(HASH_A))) == observation_a
    assert VisualObservationStore(tmp_path).get_by_hash(HASH_B) == observation_b
    assert (tmp_path / ".agent-ui/visual-observations" / HASH_B / "preview.webp").read_bytes() == WEBP
    result = verify(HASH_B, store)
    assert result.runtimeStatus == "passed"
    assert result.visualObservationStatus == "observed"
    assert result.visualObservation.currentHash == HASH_B
    assert result.visualObservation.observationId == observation_b["observationId"]


def test_mismatched_observation_is_stale_without_failing_runtime():
    class WrongStore:
        def get_by_hash(self, _: str) -> dict:
            return {"currentHash": HASH_A}

    result = verify(HASH_B, WrongStore())
    assert result.runtimeStatus == "passed"
    assert result.visualObservationStatus == "stale"
    assert result.visualObservation is None


def test_capture_unavailable_does_not_fail_deterministic_verification():
    class FailedStore:
        def get_by_hash(self, _: str) -> dict:
            raise OSError("capture failed")

    result = verify(HASH_B, FailedStore())
    assert result.staticStatus == "passed"
    assert result.runtimeStatus == "passed"
    assert result.visualObservationStatus == "unavailable"


def test_visual_endpoint_is_independent_authenticated_and_size_bounded(tmp_path):
    settings = CreatorServerSettings(
        project_root=tmp_path, skills_root=tmp_path, auth_token="x" * 32,
    )
    app = create_app(settings)
    unauthenticated = TestClient(app).post("/visual-observation", json=payload(HASH_A))
    assert unauthenticated.status_code == 401
    client = TestClient(app, headers={"Authorization": f"Bearer {settings.auth_token}"})
    accepted = client.post("/visual-observation", json=payload(HASH_A))
    assert accepted.status_code == 202
    assert accepted.json()["observation"]["currentHash"] == HASH_A
    assert client.post("/visual-observation", content=b"x" * (MAX_VISUAL_OBSERVATION_REQUEST_BYTES + 1)).status_code == 400
    assert app.state.runtime_diagnostics.inspect(
        thread_id="thread", current_app_ui_model_hash=HASH_A,
    )["runtimeObserved"] is False
