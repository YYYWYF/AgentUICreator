"""Read official delivery IDs from the target project's installed package.

No vendor source or independent copy of the official plugin catalog lives in Creator.
"""
from __future__ import annotations

import json
from pathlib import Path


def official_package_plugin_ids(project_root: Path) -> set[str]:
    # Composer remains available when the installed catalog cannot be read.
    result = {"composer"}
    package_root = project_root / "node_modules" / "@za38.03" / "agent-ui-plugins"
    try:
        package = json.loads((package_root / "package.json").read_text(encoding="utf-8"))
        catalog = json.loads((package_root / "dist" / "catalog.json").read_text(encoding="utf-8"))
        if (package.get("name") != "@za38.03/agent-ui-plugins"
                or catalog.get("package") != {"name": package["name"], "version": package["version"]}):
            return result
        result.update(entry["id"] for entry in catalog.get("plugins", [])
                      if isinstance(entry, dict) and isinstance(entry.get("id"), str) and entry.get("takeover"))
    except (OSError, ValueError, TypeError, KeyError, AttributeError):
        pass
    return result


def is_legacy_project_plugin(project_root: Path, plugin_id: str) -> bool:
    """Newly packaged IDs may already contain user-owned, pre-migration code.

    This never installs a baseline or treats a wrapper as takeover consent.
    New identities remain blocked by the creation and source write guards.
    """
    from .project_paths import agent_ui_source_path
    try:
        package_root = project_root / "node_modules" / "@za38.03" / "agent-ui-plugins"
        package = json.loads((package_root / "package.json").read_text(encoding="utf-8"))
        catalog = json.loads((package_root / "dist" / "catalog.json").read_text(encoding="utf-8"))
        if (package.get("name") != "@za38.03/agent-ui-plugins"
                or catalog.get("package") != {"name": package["name"], "version": package["version"]}):
            return False
        if not any(entry.get("id") == plugin_id and entry.get("application", {}).get("preserveLegacySource") is True
                   for entry in catalog.get("plugins", [])):
            return False
        directory = project_root / agent_ui_source_path(project_root, f"plugins/{plugin_id}").lstrip("/")
        if directory.is_symlink() or ((directory / "application.json").exists() or (directory / "application.json").is_symlink()):
            return False
        manifest = directory / "manifest.json"
        definition = directory / "definition.ts"
        return (not manifest.is_symlink() and not definition.is_symlink() and definition.is_file()
                and json.loads(manifest.read_text(encoding="utf-8")).get("id") == plugin_id)
    except (OSError, ValueError, TypeError, KeyError, AttributeError):
        return False
