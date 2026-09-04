from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path

CREATOR_PYTHON_PROTOCOL_VERSION = "1"


class CreatorConfigurationError(ValueError):
    """Raised when the sidecar cannot satisfy its startup contract."""


@dataclass(frozen=True, slots=True)
class CreatorServerSettings:
    project_root: Path
    skills_root: Path
    auth_token: str
    host: str = "127.0.0.1"
    port: int = 0
    config_root: Path | None = None
    parent_pid: int | None = None

    @classmethod
    def from_arguments(cls, arguments: list[str] | None = None) -> "CreatorServerSettings":
        parser = argparse.ArgumentParser(description="Agent UI Creator Python sidecar")
        parser.add_argument("--project-root", required=True)
        parser.add_argument("--skills-root", required=True)
        parser.add_argument("--config-root")
        parser.add_argument("--auth-token", required=True)
        parser.add_argument("--host", default="127.0.0.1")
        parser.add_argument("--port", type=int, default=0)
        parser.add_argument("--parent-pid", type=int)
        parsed = parser.parse_args(arguments)

        if sys.version_info < (3, 11):
            raise CreatorConfigurationError(
                "CREATOR_PYTHON_RUNTIME_MISSING: Python 3.11 or newer is required."
            )
        if parsed.host != "127.0.0.1":
            raise CreatorConfigurationError(
                "Creator Python sidecar may only bind to 127.0.0.1."
            )
        if parsed.port < 0 or parsed.port > 65_535:
            raise CreatorConfigurationError("Creator Python port is out of range.")
        if len(parsed.auth_token) < 32:
            raise CreatorConfigurationError(
                "Creator Python auth token must contain at least 32 characters."
            )

        project_root = Path(parsed.project_root).expanduser().resolve()
        skills_root = Path(parsed.skills_root).expanduser().resolve()
        config_root = (
            None
            if parsed.config_root is None
            else Path(parsed.config_root).expanduser().resolve()
        )
        if not project_root.is_dir():
            raise CreatorConfigurationError(
                f"Creator project root is unavailable: {project_root}"
            )
        if not skills_root.is_dir():
            raise CreatorConfigurationError(
                f"Creator skills root is unavailable: {skills_root}"
            )
        if config_root is not None and not config_root.is_dir():
            raise CreatorConfigurationError(
                f"Creator config root is unavailable: {config_root}"
            )

        return cls(
            project_root=project_root,
            skills_root=skills_root,
            config_root=config_root,
            auth_token=parsed.auth_token,
            host=parsed.host,
            port=parsed.port,
            parent_pid=parsed.parent_pid,
        )
