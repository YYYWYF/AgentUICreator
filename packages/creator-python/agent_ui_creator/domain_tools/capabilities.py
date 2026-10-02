"""A live navigation index; declarations and source remain authoritative."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

_SKIP = {"node_modules", "dist", "build", "coverage", "vendor", "runtime", "framework", "plugins", "__pycache__"}


def component_navigation(root: Path, *, limit: int = 200) -> tuple[list[dict[str, Any]], bool]:
    entries: list[dict[str, Any]] = []
    visited = 0
    for directory, dirs, files in os.walk(root, followlinks=False):
        dirs[:] = sorted(d for d in dirs if not d.startswith(".") and d not in _SKIP
                         and not (Path(directory) / d).is_symlink())
        for name in sorted(files):
            visited += 1
            if visited > 10_000:
                return entries, False
            path = Path(directory) / name
            if path.is_symlink() or path.suffix not in {".tsx", ".jsx"} or any(
                part in name for part in (".test.", ".spec.", ".stories.")
            ):
                continue
            relative = path.relative_to(root).as_posix()
            entries.append({
                "id": relative, "kind": "host-component", "sourcePath": "/" + relative,
                "integration": "inspect-source-then-adapter",
                "behaviorVerified": False,
                **({"suggestedFacade": "useConversationComposer from @agent-ui/react",
                    "preserveBehavior": ["send", "stop", "attachment", "draft"],
                    "suggestedSlot": "composer"} if "composer" in name.lower() else {}),
            })
            if len(entries) >= limit:
                return entries, False
    return entries, True


def capability_navigation(project: dict, sources: dict, root: Path | None) -> dict:
    components, complete = component_navigation(root) if root is not None else ([], False)
    plugins = project.get("pluginAssets", [])
    summaries = [{key: plugin[key] for key in ("pluginId", "name", "description", "capabilities", "authoring", "childSlots", "manifestPath", "definitionPath", "layoutWidth", "applicationGate", "selected") if key in plugin}
                 for plugin in plugins if isinstance(plugin, dict)]
    # Full ProjectControl inspection is the owner of installed asset identity.
    plugin_ids = [p["pluginId"] for p in plugins if isinstance(p, dict) and isinstance(p.get("pluginId"), str)]
    return {
        "schemaVersion": 1,
        "authority": "navigation-only; inspect the referenced declaration/source before implementation",
        "appUIModelHash": project.get("appUIModel", {}).get("hash"),
        "sourceStateHash": sources.get("stateHash"),
        "plugins": summaries,
        "sources": sources,
        "components": components,
        "componentInventoryComplete": complete,
        "pluginInventoryComplete": isinstance(project.get("pluginAssets"), list) and len(plugin_ids) == len(plugins),
        "pluginIds": plugin_ids,
        "placements": {
            "layout": project.get("appUIModel", {}).get("layout"),
            "slots": project.get("appUIModel", {}).get("slots", []),
            "defaultPlacementFrom": "plugins[].authoring.defaultPlacement",
            "refreshBeforeMutation": "inspect_ui_project(view='composition')",
        },
        "uiStack": project.get("uiStack", []),
        "limitations": ["Component filenames are candidates, not a capability guarantee.",
                         "Placement support depends on the current layout and Plugin authoring contract.",
                         "Incomplete component discovery does not prove absence; use a targeted project search."],
    }
