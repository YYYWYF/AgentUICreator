from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping

CREATOR_MODEL_NAME = "mimo-v2.5-pro"
CREATOR_HOST_ENV_FILE = ".env.creator.local"
DEFAULT_CREATOR_MODEL_MAX_RETRIES = 2


class CreatorModelConfigurationError(ValueError):
    """Raised when Creator model settings are incomplete or invalid."""


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
                f"{CREATOR_HOST_ENV_FILE} 第 {index} 行格式不正确，应为 KEY=VALUE。"
            )
        key, raw_value = line.split("=", 1)
        key = key.strip()
        value = raw_value.strip()
        if not key.replace("_", "a").isalnum() or key[0].isdigit():
            raise CreatorModelConfigurationError(
                f"{CREATOR_HOST_ENV_FILE} 第 {index} 行的变量名称无效。"
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
    mode = (
        _first_value(environment, file_values, "CREATOR_PYTHON_AGENT_MODE")
        or "domain-write"
    )
    if mode not in {"echo", "minimal", "domain-read", "domain-write"}:
        raise CreatorModelConfigurationError(
            "CREATOR_PYTHON_AGENT_MODE 必须是 echo、minimal、domain-read 或 domain-write。"
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
        raise CreatorModelConfigurationError(f"{name} 必须是数字。") from error
    if parsed < 0:
        raise CreatorModelConfigurationError(f"{name} 不能小于 0。")
    return parsed


@dataclass(frozen=True, slots=True)
class CreatorModelSettings:
    model_name: str
    base_url: str
    api_key: str
    temperature: float = 0.2
    max_tokens: int = 2048
    timeout_seconds: float = 120.0
    max_retries: int = DEFAULT_CREATOR_MODEL_MAX_RETRIES
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
                "Python Creator 需要使用兼容 OpenAI API 的模型服务。"
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
                "缺少 Creator 模型服务地址。请设置 CREATOR_MODEL_BASE_URL 或 MODEL_BASE_URL。"
            )
        if api_key is None:
            raise CreatorModelConfigurationError(
                "缺少 Creator 模型 API 密钥。请设置 CREATOR_MODEL_API_KEY、MODEL_API_KEY 或 OPENAI_API_KEY。"
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
            default=DEFAULT_CREATOR_MODEL_MAX_RETRIES,
            name="CREATOR_MODEL_MAX_RETRIES",
            cast=int,
        )
        raw_trace = _first_value(
            environment, file_values, "CREATOR_MODEL_RAW_TRACE"
        ) == "1"
        if max_tokens == 0 or timeout_seconds == 0:
            raise CreatorModelConfigurationError(
                "Creator 模型的最大 token 数和超时时间必须大于 0。"
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


@dataclass(frozen=True, slots=True)
class CreatorSelectorModelSettings:
    max_tokens: int = 512
    reasoning_effort: str | None = None

    @classmethod
    def from_environment(
        cls,
        *,
        environment: Mapping[str, str] | None = None,
        config_root: Path | None = None,
    ) -> "CreatorSelectorModelSettings":
        environment = os.environ if environment is None else environment
        file_values = _parse_environment_file(config_root)
        max_tokens = _number(
            _first_value(environment, file_values, "CREATOR_SELECTOR_MAX_TOKENS"),
            default=512,
            name="CREATOR_SELECTOR_MAX_TOKENS",
            cast=int,
        )
        if max_tokens == 0:
            raise CreatorModelConfigurationError(
                "CREATOR_SELECTOR_MAX_TOKENS 必须大于 0。"
            )
        reasoning_effort = _first_value(
            environment, file_values, "CREATOR_SELECTOR_REASONING_EFFORT"
        )
        return cls(max_tokens=int(max_tokens), reasoning_effort=reasoning_effort)
