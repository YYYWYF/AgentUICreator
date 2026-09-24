from __future__ import annotations

import json
from pathlib import Path, PurePosixPath


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
    raw = config.get("sourceRoot")
    if not isinstance(raw, str) or not raw or "\\" in raw or ":" in raw or "\x00" in raw:
        raise ValueError("Invalid V2 sourceRoot.")
    source = PurePosixPath(raw)
    if source.is_absolute() or any(part in {"", ".", ".."} for part in raw.split("/")):
        raise ValueError("Invalid V2 sourceRoot.")
    resolved = (root / raw).resolve()
    if resolved == root or not resolved.is_relative_to(root):
        raise ValueError("V2 sourceRoot escapes Project Root.")
    return raw
