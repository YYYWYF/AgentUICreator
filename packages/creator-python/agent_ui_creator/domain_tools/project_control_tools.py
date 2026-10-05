from __future__ import annotations

import json
import hashlib
import re
import secrets
from dataclasses import dataclass, field
from typing import Any, Literal

from langchain_core.tools import BaseTool, tool

from .capabilities import capability_navigation
from ..activity import CreatorActivityRecorder
from ..domain_state import (
    CROSS_LAYER_DOMAIN_READ_NAMES,
    DomainObservationContext,
    DomainObservationError,
    ObservationCoverage,
    ObservationSource,
    composition_fast_path_error,
)
from ..project_control import ProjectControlClient, ProjectControlError

MAX_DOMAIN_TOOL_RESULT_CHARS = 48_000
MAX_DOMAIN_TOOL_RESULT_BYTES = 48_000
PROJECT_INSPECTION_PAGE_CHARS = 20_000
_PROJECT_CURSOR = re.compile(r"([0-9a-f]{64}):([0-9a-f]{32}):([1-9][0-9]*)\Z")
DOMAIN_READ_TOOL_NAMES = (
    "inspect_ui_project",
    "inspect_app_ui_model",
    "list_ui_plugins",
    "inspect_ui_slots",
    "inspect_ui_plugin",
    "preflight_ui_plugin_placement",
    "inspect_ui_services",
    "inspect_ui_plugin_source_references",
    "inspect_agent_ui_sources",
    "inspect_ui_capabilities",
)
COMPOSITION_SNAPSHOT_COVERAGE: tuple[ObservationCoverage, ...] = (
    "composition.model",
    "composition.layout",
    "composition.slots",
    "composition.instances",
    "capability.inventory",
    "capability.composition-summary",
)


def _composition_navigation(result: dict[str, Any]) -> dict[str, Any]:
    """Keep the facts needed for a composition decision without catalog duplication.

    The Selector already receives the complete Action and Authoring Target
    catalogs from ProjectControl. Their revision/count remain visible here;
    exact source and service details have dedicated inspection tools.
    """
    if not {"creatorActions", "authoringTargetCatalog", "capabilitySummaries", "observationCoverage"}.issubset(result):
        return result
    actions = result["creatorActions"]
    targets = result["authoringTargetCatalog"]
    return {
        **{key: value for key, value in result.items()
           if key not in {"creatorActions", "authoringTargetCatalog"}},
        "observationCoverage": [
            item for item in result["observationCoverage"]
            if item not in {"creator.actions", "creator.authoring-targets"}
        ],
        "capabilitySummaries": [
            {key: value for key, value in summary.items() if key != "currentInstances"}
            for summary in result["capabilitySummaries"]
        ],
        "catalogNavigation": {
            "creatorActions": {"revision": actions["revision"], "count": len(actions["candidates"]), "detailsIn": "Selector"},
            "authoringTargets": {"revision": targets["revision"], "count": len(targets["candidates"]), "detailsIn": "Selector"},
        },
        "sourceDiscovery": {
            "availableVia": "inspect_agent_ui_sources",
            "note": "Plugin inventory covers installed project plugins; inspect available Source Items before implementing a missing reusable capability.",
        },
    }


def _project_navigation(result: dict[str, Any]) -> dict[str, Any]:
    if "authoringTargetCatalog" not in result:
        return result
    targets = result["authoringTargetCatalog"]
    return {
        **{key: value for key, value in result.items() if key != "authoringTargetCatalog"},
        "authoringTargetNavigation": {
            "revision": targets["revision"],
            "count": len(targets["candidates"]),
            "detailsIn": "Selector",
        },
        "sourceDiscovery": {"availableVia": "inspect_agent_ui_sources"},
    }


def _source_inventory(result: dict[str, Any]) -> dict[str, Any]:
    if "items" not in result:
        return result
    source_root = result.get("sourceRoot")
    return {
        **{key: value for key, value in result.items() if key != "items"},
        "sourceInstallNavigation": {
            "tool": "apply_agent_ui_source_item",
            "itemIdFrom": "items[].id",
            "expectedStateHashFrom": "stateHash",
            "filesystemSourceRoot": "/" + source_root.strip("/") if isinstance(source_root, str) else None,
        },
        "items": [
            {
                "id": item["id"],
                **({"description": item["description"]} if "description" in item else {}),
                "status": item["status"],
                "owned": item["owned"],
                "updateAvailable": item["updateAvailable"],
                "fileCount": len(item.get("files", [])),
                "dependencyIssueCodes": sorted({issue["code"] for issue in item.get("dependencyIssues", [])}),
                "issueCodes": sorted({issue["code"] for issue in item.get("issues", [])}),
            }
            for item in result["items"]
        ],
        "inventoryComplete": True,
        "itemDetailsIncluded": False,
        "applyReportsDependencyAndPathConflicts": True,
    }


def _render_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)


def _within_result_limit(rendered: str) -> bool:
    return (
        len(rendered) <= MAX_DOMAIN_TOOL_RESULT_CHARS
        and len(rendered.encode("utf-8")) <= MAX_DOMAIN_TOOL_RESULT_BYTES
    )


def _render_result(result: Any) -> str:
    rendered = _render_json({"ok": True, "result": result})
    if _within_result_limit(rendered):
        return rendered
    return _render_json(
        {
            "ok": False,
            "error": {
                "code": "PROJECT_CONTROL_RESULT_TOO_LARGE",
                "message": (
                    "ProjectControl result exceeds the domain tool limit; use a more "
                    "targeted inspection tool."
                ),
                "details": {
                    "limitChars": MAX_DOMAIN_TOOL_RESULT_CHARS,
                    "resultChars": len(rendered),
                    "limitUtf8Bytes": MAX_DOMAIN_TOOL_RESULT_BYTES,
                    "resultUtf8Bytes": len(rendered.encode("utf-8")),
                },
            },
        },
    )


@dataclass(slots=True)
class _ProjectInspectionPages:
    snapshot_hash: str
    nonce: str
    revision: int
    next_offset: int = 0
    delivered_offsets: set[int] = field(default_factory=set)
    complete: bool = False
    coverage_recorded: bool = False


def _project_cursor_error(code: str, message: str) -> str:
    return _render_json({"ok": False, "error": {"code": code, "message": message}})


def _render_project_inspection(
    result: Any,
    cursor: str | None,
    *,
    state: _ProjectInspectionPages | None,
    revision: int,
) -> tuple[str, bool, _ProjectInspectionPages | None]:
    """Deliver only contiguous pages from one run-scoped snapshot and view."""
    complete = _render_json({"ok": True, "result": result})
    snapshot_hash = hashlib.sha256(complete.encode("utf-8")).hexdigest()
    if cursor is None and _within_result_limit(complete):
        return complete, True, None

    offset = 0
    if cursor is not None:
        match = _PROJECT_CURSOR.fullmatch(cursor)
        if match is None or int(match.group(3)) >= len(complete):
            return _project_cursor_error(
                "PROJECT_CONTROL_CURSOR_INVALID", "The project inspection cursor is invalid."
            ), False, state
        if match.group(1) != snapshot_hash:
            return _project_cursor_error(
                "PROJECT_CONTROL_SNAPSHOT_STALE",
                "Project inspection changed between pages; restart from the first page.",
            ), False, None
        if state is None or state.nonce != match.group(2):
            return _project_cursor_error(
                "PROJECT_CONTROL_CURSOR_INVALID", "The cursor belongs to another inspection."
            ), False, state
        if state.snapshot_hash != snapshot_hash or state.revision != revision:
            return _project_cursor_error(
                "PROJECT_CONTROL_SNAPSHOT_STALE",
                "Project inspection revision changed between pages; restart from the first page.",
            ), False, None
        offset = int(match.group(3))
        if offset != state.next_offset and offset not in state.delivered_offsets:
            return _project_cursor_error(
                "PROJECT_CONTROL_CURSOR_OUT_OF_ORDER",
                "Read the next cursor in order before using later pages.",
            ), False, state
    elif state is None or state.snapshot_hash != snapshot_hash or state.revision != revision:
        state = _ProjectInspectionPages(
            snapshot_hash=snapshot_hash,
            nonce=secrets.token_hex(16),
            revision=revision,
        )

    assert state is not None
    end = min(offset + PROJECT_INSPECTION_PAGE_CHARS, len(complete))
    while True:
        rendered = _render_json({"ok": True, "result": {
            "pageComplete": end == len(complete),
            "snapshotHash": snapshot_hash,
            "appUIModelHash": result.get("appUIModel", {}).get("hash") if isinstance(result, dict) else None,
            "pageOffset": offset,
            "totalChars": len(complete),
            "pageText": complete[offset:end],
            "nextCursor": f"{snapshot_hash}:{state.nonce}:{end}" if end < len(complete) else None,
        }})
        if _within_result_limit(rendered):
            break
        if end - offset <= 1:
            raise ValueError("A project inspection page cannot fit the tool result limit.")
        end = offset + (end - offset) // 2
    if offset == state.next_offset:
        state.delivered_offsets.add(offset)
        state.next_offset = end
        state.complete = end == len(complete)
    return rendered, state.complete, state


def _render_error(error: ProjectControlError | DomainObservationError) -> str:
    rendered = _render_json(
        {
            "ok": False,
            "error": {
                "code": error.code,
                "message": str(error),
                **({"details": error.details} if error.details is not None else {}),
            },
        }
    )
    if _within_result_limit(rendered):
        return rendered
    return _render_json(
        {
            "ok": False,
            "error": {
                "code": error.code,
                "message": "ProjectControl error details exceeded the domain tool limit.",
                "details": {
                    "limitChars": MAX_DOMAIN_TOOL_RESULT_CHARS,
                    "resultChars": len(rendered),
                    "limitUtf8Bytes": MAX_DOMAIN_TOOL_RESULT_BYTES,
                    "resultUtf8Bytes": len(rendered.encode("utf-8")),
                },
            },
        }
    )


def create_project_control_tools(
    client: ProjectControlClient,
    *,
    observations: DomainObservationContext | None = None,
    activity: CreatorActivityRecorder | None = None,
) -> tuple[BaseTool, ...]:
    paging_states: dict[str, _ProjectInspectionPages] = {}

    def observe(hash: Any, source: ObservationSource) -> None:
        if observations is None or activity is None:
            return
        observations.observe_app_ui_model(
            hash=hash,
            revision=activity.revision,
            source=source,
        )

    def already_covered(required: tuple[ObservationCoverage, ...]) -> str | None:
        if observations is None or activity is None:
            return None
        if not observations.has_fresh_coverage(
            required,
            current_revision=activity.revision,
        ):
            return None
        observations.record_covered_read_rejection()
        return _render_json(
            {
                "ok": False,
                "error": {
                    "code": "OBSERVATION_ALREADY_COVERED",
                    "message": "Fresh Composition grounding already contains this fact.",
                },
            }
        )

    def cross_layer_read_prohibited(name: str) -> str | None:
        if (
            observations is None
            or activity is None
            or name not in CROSS_LAYER_DOMAIN_READ_NAMES
            or observations.composition_grounding_status(
                current_revision=activity.revision
            )
            != "grounded"
        ):
            return None
        observations.composition_fast_path_metrics.record_cross_layer_read_attempt()
        return _render_json(composition_fast_path_error())

    @tool("inspect_ui_capabilities")
    async def inspect_ui_capabilities(cursor: str | None = None) -> str:
        """Discover installed Plugins, formal Source Items, project component paths, UI stack and legal authoring targets together. This live navigation index is not source truth. Read every page before concluding absence; then inspect only the selected implementation. It never grants development permission."""
        try:
            project = await client.inspect_ui_project()
            sources = _source_inventory(await client.inspect_agent_ui_sources())
            result = capability_navigation(project, sources, activity.project_root if activity else None)
            rendered, complete, state = _render_project_inspection(
                result, cursor, state=paging_states.get("capabilities"),
                revision=activity.revision if activity else 0,
            )
            if state is not None:
                paging_states["capabilities"] = state
            if complete and observations is not None and activity is not None:
                observations.clear_composition_grounding(
                    reason="capability_navigation", current_revision=activity.revision,
                )
            return rendered
        except (ProjectControlError, DomainObservationError) as error:
            return _render_error(error)

    @tool("inspect_ui_project")
    async def inspect_ui_project(
        view: Literal["composition"] | None = None,
        cursor: str | None = None,
    ) -> str:
        """Inspect current authoritative workspace facts. For a pure Composition request, use view='composition' to get the AppUIModel hash, Layout refs and sizes, Slots and instances, capability authoring semantics, Service readiness, Active Composition, deterministic Layout constraints, and Host mutation guarantees. Selector-only Action and Authoring Target details are omitted; their revisions and counts remain. Omit view only when another layer's broader project navigation facts are genuinely required. Oversized results return explicit pageText and nextCursor; read every page under one snapshotHash before treating it as complete."""
        if view == "composition":
            if observations is not None:
                observations.record_composition_snapshot_attempt()
            covered = already_covered(COMPOSITION_SNAPSHOT_COVERAGE) if cursor is None else None
            if covered is not None:
                return covered
        try:
            view_key = view or "project"
            result = (
                await client.inspect_ui_project(view="composition")
                if view == "composition"
                else await client.inspect_ui_project()
            )
            result = (
                _composition_navigation(result)
                if view == "composition"
                else _project_navigation(result)
            )
            current_revision = activity.revision if activity is not None else 0
            current_hash = (
                observations.current_hash(current_revision=current_revision)
                if observations is not None else None
            )
            result_hash = result.get("appUIModel", {}).get("hash")
            if current_hash is not None and current_hash != result_hash:
                observations.invalidate_app_ui_model(reason="project_inspection_changed")
            rendered, complete, state = _render_project_inspection(
                result, cursor,
                state=paging_states.get(view_key),
                revision=current_revision,
            )
            if state is None:
                paging_states.pop(view_key, None)
            else:
                paging_states[view_key] = state
            if json.loads(rendered).get("ok") is not True:
                return rendered
            if not complete:
                return rendered
            if state is not None and state.coverage_recorded:
                return rendered
            app_ui_model_hash = result.get("appUIModel", {}).get("hash")
            if view == "composition":
                if observations is not None and activity is not None:
                    observations.observe_composition_snapshot(
                        hash=app_ui_model_hash,
                        revision=activity.revision,
                        coverage=result.get("observationCoverage", []),
                    )
            else:
                observe(app_ui_model_hash, "inspect_ui_project")
                if observations is not None and activity is not None:
                    observations.clear_composition_grounding(
                        reason="full_project_navigation",
                        current_revision=activity.revision,
                    )
            if state is not None:
                state.coverage_recorded = True
            return rendered
        except (ProjectControlError, DomainObservationError) as error:
            return _render_error(error)

    @tool("inspect_app_ui_model")
    async def inspect_app_ui_model() -> str:
        """Inspect the exact current authoring AppUIModel, snapshot-scoped refs, and hash when a precise mutation needs them. Do not use it to rediscover AppUIModel grammar."""
        covered = already_covered((
            "composition.model",
            "composition.layout",
            "composition.slots",
            "composition.instances",
        ))
        if covered is not None:
            return covered
        try:
            result = await client.inspect_app_ui_model()
            observe(result.get("hash"), "inspect_app_ui_model")
            return _render_result(result)
        except ProjectControlError as error:
            return _render_error(error)

    @tool("list_ui_plugins")
    async def list_ui_plugins() -> str:
        """Discover the current project's available UI Plugin assets and declarations, including identity, description, capabilities, and declared child Slots. Use this to find which Plugin provides a requested capability; do not call it to learn general composition rules."""
        covered = already_covered((
            "composition.model",
            "composition.instances",
            "capability.inventory",
            "capability.composition-summary",
        ))
        if covered is not None:
            return covered
        try:
            result = await client.list_ui_plugins()
            observe(result.get("appUIModelHash"), "list_ui_plugins")
            return _render_result(result)
        except ProjectControlError as error:
            return _render_error(error)

    @tool("inspect_ui_slots")
    async def inspect_ui_slots(
        target: dict[str, Any] | None = None,
        appUIModelHash: str | None = None,
    ) -> str:
        """Inspect current Slot declarations and occupancy for a specific authoring target. Plugin-local results describe mode (content or renderer), accepted capabilities, cardinality, optional state, and occupants; use this only when current Slot facts are needed. Layout Slot targets require the latest AppUIModel hash."""
        covered = already_covered(("composition.slots",))
        if covered is not None:
            return covered
        try:
            if appUIModelHash is None:
                result = await client.inspect_ui_slots(target=target)
            else:
                result = await client.inspect_ui_slots(
                    target=target,
                    app_ui_model_hash=appUIModelHash,
                )
            observe(result.get("appUIModelHash"), "inspect_ui_slots")
            return _render_result(result)
        except ProjectControlError as error:
            return _render_error(error)

    @tool("inspect_ui_plugin")
    async def inspect_ui_plugin(pluginId: str) -> str:
        """Inspect one currently known UI Plugin's declaration and current authoring composition state. Prefer this after pluginId is known."""
        prohibited = cross_layer_read_prohibited("inspect_ui_plugin")
        if prohibited is not None:
            return prohibited
        try:
            return _render_result(await client.inspect_ui_plugin(pluginId))
        except ProjectControlError as error:
            return _render_error(error)

    @tool("preflight_ui_plugin_placement")
    async def preflight_ui_plugin_placement(
        appUIModelHash: str, capabilityCatalogRevision: str,
        instanceId: str, manifest: dict[str, Any],
    ) -> str:
        """Check a proposed visual Plugin's canonical position against the current AppUIModel and Slot contract before creating source. This read does not reserve the Slot, verify Services or geometry, or grant development permission. Use current hashes; commit rechecks all constraints."""
        try:
            return _render_result(await client.preflight_ui_plugin_placement(
                app_ui_model_hash=appUIModelHash,
                capability_catalog_revision=capabilityCatalogRevision,
                instance_id=instanceId,
                manifest=manifest,
            ))
        except ProjectControlError as error:
            return _render_error(error)

    @tool("inspect_ui_services")
    async def inspect_ui_services() -> str:
        """Inspect declared Service providers and composition availability; this does not test a live backend connection."""
        prohibited = cross_layer_read_prohibited("inspect_ui_services")
        if prohibited is not None:
            return prohibited
        try:
            result = await client.inspect_ui_services()
            observe(result.get("appUIModelHash"), "inspect_ui_services")
            return _render_result({
                **result,
                "availabilityEvidence": {
                    "statusScope": "project composition and declared provider dependencies",
                    "liveBackendConnection": "not tested by this inspection",
                },
            })
        except ProjectControlError as error:
            return _render_error(error)

    @tool("inspect_ui_plugin_source_references")
    async def inspect_ui_plugin_source_references(pluginId: str) -> str:
        """Locate one UI plugin's authoritative source entry and related files."""
        prohibited = cross_layer_read_prohibited(
            "inspect_ui_plugin_source_references"
        )
        if prohibited is not None:
            return prohibited
        try:
            return _render_result(
                await client.inspect_ui_plugin_source_references(pluginId)
            )
        except ProjectControlError as error:
            return _render_error(error)

    @tool("inspect_agent_ui_sources")
    async def inspect_agent_ui_sources() -> str:
        """List all available and installed Agent UI Source Items with current stateHash, status, ownership, content update availability, and issue codes. The inventory is complete; file and dependency details are omitted. apply_agent_ui_source_item reports checked dependency and path conflicts without overwriting user files."""
        prohibited = cross_layer_read_prohibited("inspect_agent_ui_sources")
        if prohibited is not None:
            return prohibited
        try:
            rendered = _render_result(_source_inventory(await client.inspect_agent_ui_sources()))
            if observations is not None and json.loads(rendered).get("ok") is True:
                observations.record_source_inventory()
            return rendered
        except ProjectControlError as error:
            return _render_error(error)

    @tool("apply_agent_ui_source_item")
    async def apply_agent_ui_source_item(
        itemId: str, expectedStateHash: str
    ) -> str:
        """Install an available Source Item by id and stateHash; after a changed install inspect_ui_project(view='composition') before composing."""
        candidate_paths: set[str] = set()
        if activity is not None:
            try:
                inspection = await client.inspect_agent_ui_sources()
                source_root = inspection.get("sourceRoot")
                metadata_root = inspection.get("metadataRoot")
                if isinstance(source_root, str):
                    for item in inspection.get("items", []):
                        if not isinstance(item, dict):
                            continue
                        for file in item.get("files", []):
                            if isinstance(file, dict) and isinstance(file.get("path"), str):
                                candidate_paths.add(file["path"])
                if isinstance(metadata_root, str):
                    candidate_paths.add(f"{metadata_root}/source-lock.json")
                for path in sorted(candidate_paths):
                    activity.capture_before(path)
            except (ProjectControlError, OSError, ValueError):
                candidate_paths.clear()
        try:
            result = await client.apply_agent_ui_source_item(
                item_id=itemId,
                expected_state_hash=expectedStateHash,
            )
            if activity is not None:
                changed_paths = result.get("changedPaths", [])
                if isinstance(changed_paths, list):
                    for path in sorted(
                        value for value in changed_paths if isinstance(value, str)
                    ):
                        if path not in candidate_paths:
                            activity.capture_before_content(path, None)
                        activity.file_observations.observe(path)
                        activity.touch(path)
                if result.get("changed") is False:
                    activity.record_semantic_noop(
                        source="apply_agent_ui_source_item",
                        reason="already-managed",
                    )
            if result.get("changed") is True:
                if observations is not None:
                    observations.invalidate_app_ui_model(
                        reason="agent_ui_source_install_changed_project"
                    )
                result = {
                    **result,
                    "observationHandoff": {
                        "appUIModelObservation": "invalidated_by_source_change",
                        "nextReadBeforeComposition": "inspect_ui_project(view=composition)",
                    },
                }
            return _render_result(result)
        except ProjectControlError as error:
            return _render_error(error)

    @tool("purge_ui_plugin")
    async def purge_ui_plugin(pluginId: str, appUIModelHash: str, sourceStateHash: str) -> str:
        """Permanently removes a UI Plugin, all Composition instances, safely orphaned removable Service infrastructure and exclusively owned source. Use only when the user explicitly chose permanent deletion, never for hiding. Host determines all dependencies, ownership, files and cleanup closure. Inspect AppUIModel and Sources for both hashes first. Success includes static verification; do not call deletion tools afterward."""
        try:
            result = await client.purge_ui_plugin(
                plugin_id=pluginId, app_ui_model_hash=appUIModelHash,
                source_state_hash=sourceStateHash,
            )
            if activity is not None:
                for changed_path in result.get("changedPaths", []):
                    activity.file_observations.observe(changed_path)
                    activity.touch(changed_path)
            if observations is not None:
                observations.invalidate_app_ui_model(reason="plugin_purged")
            return _render_result(result)
        except ProjectControlError as error:
            return _render_error(error)

    return (
        inspect_ui_project,
        inspect_app_ui_model,
        list_ui_plugins,
        inspect_ui_slots,
        inspect_ui_plugin,
        preflight_ui_plugin_placement,
        inspect_ui_services,
        inspect_ui_plugin_source_references,
        inspect_agent_ui_sources,
        inspect_ui_capabilities,
        apply_agent_ui_source_item,
        purge_ui_plugin,
    )
