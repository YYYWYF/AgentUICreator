from __future__ import annotations

import json
from typing import Any, Literal

from langchain_core.tools import BaseTool, tool

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
DOMAIN_READ_TOOL_NAMES = (
    "inspect_ui_project",
    "inspect_app_ui_model",
    "list_ui_plugins",
    "inspect_ui_slots",
    "inspect_ui_plugin",
    "inspect_ui_services",
    "inspect_ui_plugin_source_references",
    "inspect_agent_ui_sources",
)
COMPOSITION_SNAPSHOT_COVERAGE: tuple[ObservationCoverage, ...] = (
    "composition.model",
    "composition.layout",
    "composition.slots",
    "composition.instances",
    "capability.inventory",
    "capability.composition-summary",
)


def _render_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)


def _render_result(result: Any) -> str:
    rendered = _render_json({"ok": True, "result": result})
    if len(rendered) <= MAX_DOMAIN_TOOL_RESULT_CHARS:
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
                },
            },
        },
    )


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
    if len(rendered) <= MAX_DOMAIN_TOOL_RESULT_CHARS:
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

    @tool("inspect_ui_project")
    async def inspect_ui_project(
        view: Literal["composition"] | None = None,
    ) -> str:
        """Inspect current authoritative workspace facts. For a pure Composition request, use view='composition' to get one compact snapshot containing the AppUIModel hash, Layout refs and sizes, Slots and instances, available capability summaries, Active Composition, and deterministic Layout constraints. Omit view only when another layer's broader project navigation facts are genuinely required."""
        if view == "composition":
            if observations is not None:
                observations.record_composition_snapshot_attempt()
            covered = already_covered(COMPOSITION_SNAPSHOT_COVERAGE)
            if covered is not None:
                return covered
        try:
            result = (
                await client.inspect_ui_project(view="composition")
                if view == "composition"
                else await client.inspect_ui_project()
            )
            rendered = _render_result(result)
            if json.loads(rendered).get("ok") is not True:
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
        """Inspect current Slot declarations and occupancy for a specific authoring target. Plugin-local results describe current declaration, cardinality, and optional state; use this only when current Slot facts are needed. Layout Slot targets require the latest AppUIModel hash."""
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

    @tool("inspect_ui_services")
    async def inspect_ui_services() -> str:
        """Inspect declared Service providers, required consumers, optional consumers, and current availability."""
        prohibited = cross_layer_read_prohibited("inspect_ui_services")
        if prohibited is not None:
            return prohibited
        try:
            result = await client.inspect_ui_services()
            observe(result.get("appUIModelHash"), "inspect_ui_services")
            return _render_result(result)
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
        """Inspect Agent UI source-registry ownership, versions, dependencies, and safe apply state."""
        prohibited = cross_layer_read_prohibited("inspect_agent_ui_sources")
        if prohibited is not None:
            return prohibited
        try:
            return _render_result(await client.inspect_agent_ui_sources())
        except ProjectControlError as error:
            return _render_error(error)

    @tool("apply_agent_ui_source_item")
    async def apply_agent_ui_source_item(
        itemId: str, expectedStateHash: str
    ) -> str:
        """Install or safely synchronize one source-registry item without overwriting customized or untracked user files."""
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
            return _render_result(result)
        except ProjectControlError as error:
            return _render_error(error)

    return (
        inspect_ui_project,
        inspect_app_ui_model,
        list_ui_plugins,
        inspect_ui_slots,
        inspect_ui_plugin,
        inspect_ui_services,
        inspect_ui_plugin_source_references,
        inspect_agent_ui_sources,
        apply_agent_ui_source_item,
    )
