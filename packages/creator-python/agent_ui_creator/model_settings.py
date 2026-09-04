from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping

CREATOR_MODEL_NAME = "mimo-v2.5-pro"
CREATOR_HOST_ENV_FILE = ".env.creator.local"


class CreatorModelConfigurationError(ValueError):
    """Raised when minimal-agent model settings are incomplete or invalid."""


def _parse_environment_file(config_root: Path | None) -> dict[str, str]:
    if config_root is None:
        return {}
    path = config_root / CREATOR_HOST_ENV_FILE
    try:
        source = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return {}
    values: dict[str, str] = {}
    for index, raw_line in enumerate(source.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise CreatorModelConfigurationError(
                f"{CREATOR_HOST_ENV_FILE} line {index} is not a valid assignment."
            )
        key, raw_value = line.split("=", 1)
        key = key.strip()
        value = raw_value.strip()
        if not key.replace("_", "a").isalnum() or key[0].isdigit():
            raise CreatorModelConfigurationError(
                f"{CREATOR_HOST_ENV_FILE} line {index} has an invalid key."
            )
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        values[key] = value
    return values


def load_python_agent_mode(
    *,
    environment: Mapping[str, str] | None = None,
    config_root: Path | None = None,
) -> str:
    environment = os.environ if environment is None else environment
    file_values = _parse_environment_file(config_root)
    mode = _first_value(environment, file_values, "CREATOR_PYTHON_AGENT_MODE") or "echo"
    if mode not in {"echo", "minimal"}:
        raise CreatorModelConfigurationError(
            "CREATOR_PYTHON_AGENT_MODE must be either echo or minimal."
        )
    return mode


def _first_value(
    environment: Mapping[str, str],
    file_values: Mapping[str, str],
    *names: str,
) -> str | None:
    for name in names:
        value = environment.get(name, "").strip()
        if value:
            return value
        value = file_values.get(name, "").strip()
        if value:
            return value
    return None


def _number(
    value: str | None,
    *,
    default: float | int,
    name: str,
    cast: type[float] | type[int],
) -> float | int:
    if value is None:
        return default
    try:
        parsed = cast(value)
    except ValueError as error:
        raise CreatorModelConfigurationError(f"{name} must be numeric.") from error
    if parsed < 0:
        raise CreatorModelConfigurationError(f"{name} must not be negative.")
    return parsed


@dataclass(frozen=True, slots=True)
class CreatorModelSettings:
    model_name: str
    base_url: str
    api_key: str
    temperature: float = 0.2
    max_tokens: int = 2048
    timeout_seconds: float = 120.0
    max_retries: int = 1
    raw_trace: bool = False

    @classmethod
    def from_environment(
        cls,
        *,
        environment: Mapping[str, str] | None = None,
        config_root: Path | None = None,
    ) -> "CreatorModelSettings":
        environment = os.environ if environment is None else environment
        file_values = _parse_environment_file(config_root)
        provider = _first_value(environment, file_values, "CREATOR_MODEL_PROVIDER", "MODEL_PROVIDER")
        if provider is not None and provider != "openai":
            raise CreatorModelConfigurationError(
                "Creator minimal agent requires an OpenAI-compatible provider."
            )

        model_name = _first_value(
            environment,
            file_values,
            "CREATOR_MODEL_NAME",
            "MODEL_API_NAME",
            "MODEL_NAME",
        ) or CREATOR_MODEL_NAME
        base_url = _first_value(
            environment, file_values, "CREATOR_MODEL_BASE_URL", "MODEL_BASE_URL"
        )
        api_key = _first_value(
            environment,
            file_values,
            "CREATOR_MODEL_API_KEY",
            "MODEL_API_KEY",
            "OPENAI_API_KEY",
        )
        if base_url is None:
            raise CreatorModelConfigurationError(
                "Missing Creator model base URL. Set CREATOR_MODEL_BASE_URL or MODEL_BASE_URL."
            )
        if api_key is None:
            raise CreatorModelConfigurationError(
                "Missing Creator model API key. Set CREATOR_MODEL_API_KEY, MODEL_API_KEY, or OPENAI_API_KEY."
            )

        temperature = _number(
            _first_value(environment, file_values, "CREATOR_MODEL_TEMPERATURE"),
            default=0.2,
            name="CREATOR_MODEL_TEMPERATURE",
            cast=float,
        )
        max_tokens = _number(
            _first_value(environment, file_values, "CREATOR_MODEL_MAX_TOKENS"),
            default=2048,
            name="CREATOR_MODEL_MAX_TOKENS",
            cast=int,
        )
        timeout_seconds = _number(
            _first_value(environment, file_values, "CREATOR_MODEL_TIMEOUT_SECONDS"),
            default=120.0,
            name="CREATOR_MODEL_TIMEOUT_SECONDS",
            cast=float,
        )
        max_retries = _number(
            _first_value(environment, file_values, "CREATOR_MODEL_MAX_RETRIES"),
            default=1,
            name="CREATOR_MODEL_MAX_RETRIES",
            cast=int,
        )
        raw_trace = _first_value(
            environment, file_values, "CREATOR_MODEL_RAW_TRACE"
        ) == "1"
        if max_tokens == 0 or timeout_seconds == 0:
            raise CreatorModelConfigurationError(
                "Creator model max tokens and timeout must be positive."
            )
        return cls(
            model_name=model_name,
            base_url=base_url.rstrip("/"),
            api_key=api_key,
            temperature=float(temperature),
            max_tokens=int(max_tokens),
            timeout_seconds=float(timeout_seconds),
            max_retries=int(max_retries),
            raw_trace=raw_trace,
        )
