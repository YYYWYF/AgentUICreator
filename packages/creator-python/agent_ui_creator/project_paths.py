from __future__ import annotations

import json
from pathlib import Path


def validate_v2_source_root(raw: object) -> str:
    if (
        not isinstance(raw, str)
        or not raw
        or raw != raw.strip()
        or "\\" in raw
        or ":" in raw
        or "\x00" in raw
        or any(part in {"", ".", ".."} for part in raw.split("/"))
    ):
        raise ValueError("Invalid V2 sourceRoot.")
    return raw


def v2_source_root(project_root: str | Path) -> str | None:
    root = Path(project_root).resolve()
    config_path = root / ".agent-ui" / "project.json"
    if not config_path.is_file():
        return None
    config = json.loads(config_path.read_text(encoding="utf-8"))
    if not isinstance(config, dict):
        raise ValueError("Invalid Agent UI project config.")
    if config.get("version") == "1":
        return None
    if config.get("version") != "2":
        raise ValueError("Unsupported Agent UI project config version.")
    raw = validate_v2_source_root(config.get("sourceRoot"))
    resolved = (root / raw).resolve()
    if resolved == root or not resolved.is_relative_to(root):
        raise ValueError("V2 sourceRoot escapes Project Root.")
    return raw


def agent_ui_source_root(project_root: str | Path) -> str | None:
    return v2_source_root(project_root)


def _logical_source_path(relative_path: str) -> str:
    if (
        not isinstance(relative_path, str)
        or not relative_path
        or relative_path != relative_path.strip()
        or "\\" in relative_path
        or ":" in relative_path
        or "\x00" in relative_path
        or any(part in {"", ".", ".."} for part in relative_path.split("/"))
    ):
        raise ValueError("Agent UI source path must be sourceRoot-relative.")
    return relative_path


def agent_ui_source_path(project_root: str | Path, relative_path: str) -> str:
    logical = _logical_source_path(relative_path)
    source_root = agent_ui_source_root(project_root)
    return f"/{source_root}/{logical}" if source_root is not None else f"/{logical}"


def agent_ui_relative_source_path(
    project_root: str | Path, project_virtual_path: str
) -> str | None:
    source_root = agent_ui_source_root(project_root)
    prefix = f"/{source_root}/" if source_root is not None else "/"
    if not isinstance(project_virtual_path, str) or not project_virtual_path.startswith(prefix):
        return None
    candidate = project_virtual_path[len(prefix):]
    if source_root is None and candidate.split("/", 1)[0] not in {
        "plugins", "services", "runtime", "conversation", "agent-ui", "app-ui"
    }:
        return None
    try:
        return _logical_source_path(candidate)
    except ValueError:
        return None
