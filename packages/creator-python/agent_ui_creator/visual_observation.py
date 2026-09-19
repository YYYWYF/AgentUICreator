"""Development-only screenshot artifacts keyed by the published AppUIModel hash."""

from __future__ import annotations

import base64
import binascii
import hashlib
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

MAX_VISUAL_OBSERVATION_REQUEST_BYTES = 1_024 * 1_024
MAX_VISUAL_OBSERVATION_IMAGE_BYTES = 760 * 1_024
_HASH = re.compile(r"^[a-f0-9]{64}$")


class VisualObservationViewport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    width: int = Field(gt=0, le=16_384)
    height: int = Field(gt=0, le=16_384)
    devicePixelRatio: float = Field(gt=0, le=8)


class VisualObservationImage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    format: Literal["webp"]
    width: int = Field(gt=0, le=4_096)
    height: int = Field(gt=0, le=4_096)
    data: str = Field(min_length=1, max_length=1_040_000)


class VisualObservationEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid")

    currentHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    capturedAt: datetime
    viewport: VisualObservationViewport
    image: VisualObservationImage
    captureDurationMs: int = Field(ge=0, le=120_000)
    imageBytes: int = Field(gt=0, le=MAX_VISUAL_OBSERVATION_IMAGE_BYTES)
    uploadStartedAt: datetime | None = None


class VisualObservationStore:
    """Keep screenshot bytes outside run logs; the first image for each hash wins."""

    def __init__(self, project_root: Path) -> None:
        self.root = project_root / ".agent-ui" / "visual-observations"
        self._by_hash: dict[str, dict[str, object]] = {}

    def get_by_hash(self, current_hash: str) -> dict[str, object] | None:
        if not isinstance(current_hash, str) or _HASH.fullmatch(current_hash) is None:
            return None
        cached = self._by_hash.get(current_hash)
        if cached is not None:
            return dict(cached)
        path = self.root / current_hash / "metadata.json"
        try:
            metadata = json.loads(path.read_text(encoding="utf-8"))
            if metadata.get("currentHash") != current_hash:
                return None
            artifact = self.root / current_hash / "preview.webp"
            if not artifact.is_file():
                return None
            self._by_hash[current_hash] = metadata
            return dict(metadata)
        except (OSError, ValueError, AttributeError):
            return None

    def record(self, envelope: VisualObservationEnvelope) -> dict[str, object]:
        existing = self.get_by_hash(envelope.currentHash)
        if existing is not None:
            return existing
        try:
            image = base64.b64decode(envelope.image.data, validate=True)
        except (binascii.Error, ValueError) as error:
            raise ValueError("Visual observation image must be valid base64.") from error
        if len(image) != envelope.imageBytes or len(image) > MAX_VISUAL_OBSERVATION_IMAGE_BYTES:
            raise ValueError("Visual observation image byte count is invalid.")
        if image[:4] != b"RIFF" or image[8:12] != b"WEBP":
            raise ValueError("Visual observation image must be WebP.")

        directory = self.root / envelope.currentHash
        directory.mkdir(parents=True, exist_ok=True)
        artifact = directory / "preview.webp"
        metadata_path = directory / "metadata.json"
        upload_duration_ms = (
            max(0, round((datetime.now(envelope.uploadStartedAt.tzinfo) - envelope.uploadStartedAt).total_seconds() * 1_000))
            if envelope.uploadStartedAt is not None and envelope.uploadStartedAt.tzinfo is not None
            else None
        )
        metadata: dict[str, object] = {
            "observationId": str(uuid4()),
            "currentHash": envelope.currentHash,
            "capturedAt": envelope.capturedAt.isoformat(),
            "format": "webp",
            "width": envelope.image.width,
            "height": envelope.image.height,
            "sha256": hashlib.sha256(image).hexdigest(),
            "artifactLocation": str(artifact),
            "captureDurationMs": envelope.captureDurationMs,
            "visualObservationBytes": len(image),
            "uploadDurationMs": upload_duration_ms,
        }
        artifact.write_bytes(image)
        metadata_path.write_text(json.dumps(metadata, separators=(",", ":")), encoding="utf-8")
        self._by_hash[envelope.currentHash] = metadata
        return dict(metadata)
