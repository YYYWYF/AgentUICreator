"""Packaged Creator contracts, with a source-checkout-only development fallback."""
from __future__ import annotations

import json
from importlib.resources import files
from importlib.resources.abc import Traversable
from pathlib import Path
from typing import Any


def creator_contract_root() -> Traversable:
    packaged = files("agent_ui_creator").joinpath("_contracts", "creator")
    if packaged.is_dir():
        return packaged

    # Only the actual monorepo source package may use repository resources.
    package = Path(__file__).resolve().parent
    repository = package.parent.parent.parent
    if (
        package == repository / "packages" / "creator-python" / "agent_ui_creator"
        and (repository / "pnpm-workspace.yaml").is_file()
        and (repository / "packages" / "creator" / "package.json").is_file()
    ):
        development = repository / "contracts" / "creator"
        if development.is_dir():
            return development
    raise RuntimeError("Creator contract resources are unavailable.")


def read_creator_contract(name: str) -> dict[str, Any]:
    if not name or "/" in name or "\\" in name or name in {".", ".."}:
        raise ValueError("Creator contract name must be a file name.")
    try:
        value = json.loads(creator_contract_root().joinpath(name).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Creator contract {name!r} is unavailable.") from error
    if not isinstance(value, dict):
        raise RuntimeError(f"Creator contract {name!r} must contain a JSON object.")
    return value
