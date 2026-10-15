from __future__ import annotations

import os
from pathlib import Path
from typing import Literal, Mapping

from .model_settings import (
    CreatorModelConfigurationError,
    _first_value,
    _parse_environment_file,
)


CreatorVerificationMode = Literal["static_only", "static_and_runtime"]
DEFAULT_CREATOR_VERIFICATION_MODE: CreatorVerificationMode = "static_only"


def resolve_creator_verification_mode(
    *,
    environment: Mapping[str, str] | None = None,
    config_root: Path | None = None,
) -> CreatorVerificationMode:
    """Resolve the one policy switch that controls Runtime verification."""

    environment = os.environ if environment is None else environment
    file_values = _parse_environment_file(config_root)
    value = (
        _first_value(environment, file_values, "CREATOR_VERIFICATION_MODE")
        or DEFAULT_CREATOR_VERIFICATION_MODE
    )
    if value not in {"static_only", "static_and_runtime"}:
        raise CreatorModelConfigurationError(
            "CREATOR_VERIFICATION_MODE 必须是 static_only 或 static_and_runtime。"
        )
    return value  # type: ignore[return-value]
