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
            if path.is_symlink() or path.suffix not in {".tsx", ".jsx", ".vue"} or any(
                part in name for part in (".test.", ".spec.", ".stories.")
            ):
                continue
            relative = path.relative_to(root).as_posix()
            entries.append({
                "id": relative, "kind": "host-component", "sourcePath": "/" + relative,
                "integration": "inspect-source-then-adapter",
                "behaviorVerified": False,
                **({"suggestedFacade": "useConversationComposer from @za38.03/agent-ui-plugins",
                    "preserveBehavior": ["send", "stop", "attachment", "draft"],
                    "suggestedSlot": "composer"} if "composer" in name.lower() else {}),
            })
            if len(entries) >= limit:
                return entries, False
    return entries, True


def capability_evidence(project: dict, sources: dict) -> dict:
    assets = project.get("pluginAssets")
    installed_complete = isinstance(assets, list) and all(
        isinstance(asset, dict) and isinstance(asset.get("pluginId"), str) for asset in assets
    )
    sources_complete = sources.get("inventoryComplete") is True
    return {
        "installedProjectPluginsComplete": installed_complete,
        "officialSourceItemsComplete": sources_complete,
        "officialSourceStateHash": sources.get("stateHash"),
        "inventoryScope": "current-project-and-configured-official-registry",
        "absenceConclusionAllowed": installed_complete and sources_complete,
        "conclusionBoundary": (
            "Read every page, then assess capability matches from declarations; names alone do not prove absence. "
            "Absence is limited to this project and this registry version, not every possible implementation."
            if installed_complete and sources_complete else
            "Inventory is incomplete. Do not conclude that the requested capability is absent from the official library."
        ),
    }


def capability_summary(project: dict, sources: dict, services: dict) -> dict:
    """Keep all candidates, but omit detailed authoring contracts and duplicated layout."""
    plugins = project.get("pluginAssets", [])
    compact_plugins = [
        {key: plugin[key] for key in ("pluginId", "name", "description", "selected", "applicationGate") if key in plugin}
        for plugin in plugins if isinstance(plugin, dict)
    ]
    compact_sources = {key: sources[key] for key in ("stateHash", "inventoryComplete", "error") if key in sources}
    if isinstance(sources.get("items"), list):
        compact_sources["items"] = [
            {key: item[key] for key in ("id", "description", "status", "owned", "updateAvailable") if key in item}
            for item in sources["items"] if isinstance(item, dict)
        ]
    return {
        "detail": "summary",
        "authority": "Project declarations and configuration; live Agent behavior is unverified.",
        "appUIModelHash": project.get("appUIModel", {}).get("hash"),
        "plugins": compact_plugins,
        "sources": compact_sources,
        "services": {key: services[key] for key in ("services", "issues", "error") if key in services},
        "uiStack": project.get("uiStack", []),
        "capabilityEvidence": capability_evidence(project, sources),
        "customization": {
            "layout": "AppUIModel placement, sizing and semantic composition",
            "appearanceAndBehavior": "Project application props, composition and public renderers first",
            "implementation": "Per-Plugin source takeover requires explicit agreement",
        },
        "nextInspection": "Overview needs no full layout dump. Inspect a selected Plugin or use detail='full' only for a concrete follow-up. Service availability does not prove endpoint configuration or a successful request.",
    }


def capability_navigation(project: dict, sources: dict, root: Path | None) -> dict:
    components, complete = component_navigation(root) if root is not None else ([], False)
    plugins = project.get("pluginAssets", [])
    summaries = [{key: plugin[key] for key in ("pluginId", "name", "description", "capabilities", "authoring", "childSlots", "manifestPath", "definitionPath", "layoutWidth", "applicationGate", "selected") if key in plugin}
                 for plugin in plugins if isinstance(plugin, dict)]
    # Full Operator inspection is the owner of installed asset identity.
    plugin_ids = [p["pluginId"] for p in plugins if isinstance(p, dict) and isinstance(p.get("pluginId"), str)]
    return {
        "authority": "navigation-only; inspect the referenced declaration/source before implementation",
        "appUIModelHash": project.get("appUIModel", {}).get("hash"),
        "sourceStateHash": sources.get("stateHash"),
        "plugins": summaries,
        "sources": sources,
        "capabilityEvidence": capability_evidence(project, sources),
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
        "uiContext": project.get("uiContext", {}),
        "limitations": ["Component filenames are candidates, not a capability guarantee.",
                         "uiStack is a configured package subset; uiContext lists declarations, not installed APIs or a UI recommendation.",
                         "Placement support depends on the current layout and Plugin authoring contract.",
                         "Incomplete component discovery does not prove absence; use a targeted project search."],
    }
