from __future__ import annotations

import json
from typing import Any

from langchain_core.tools import BaseTool, tool

from ..activity import CreatorActivityRecorder
from ..domain_state import DomainObservationContext, ObservationSource
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


def _render_error(error: ProjectControlError) -> str:
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

    @tool("inspect_ui_project")
    async def inspect_ui_project() -> str:
        """Inspect the target project's authoritative UI composition and registry state."""
        try:
            result = await client.inspect_ui_project()
            observe(result.get("appUIModel", {}).get("hash"), "inspect_ui_project")
            return _render_result(result)
        except ProjectControlError as error:
            return _render_error(error)

    @tool("inspect_app_ui_model")
    async def inspect_app_ui_model() -> str:
        """Inspect the authoritative AppUIModel without modifying it."""
        try:
            result = await client.inspect_app_ui_model()
            observe(result.get("hash"), "inspect_app_ui_model")
            return _render_result(result)
        except ProjectControlError as error:
            return _render_error(error)

    @tool("list_ui_plugins")
    async def list_ui_plugins() -> str:
        """List UI plugins from the target project's authoritative registry."""
        try:
            result = await client.list_ui_plugins()
            observe(result.get("appUIModelHash"), "list_ui_plugins")
            return _render_result(result)
        except ProjectControlError as error:
            return _render_error(error)

    @tool("inspect_ui_slots")
    async def inspect_ui_slots(root: str | None = None) -> str:
        """Inspect authoritative slot state, optionally below one slot root."""
        try:
            result = await client.inspect_ui_slots(root=root)
            observe(result.get("appUIModelHash"), "inspect_ui_slots")
            return _render_result(result)
        except ProjectControlError as error:
            return _render_error(error)

    @tool("inspect_ui_plugin")
    async def inspect_ui_plugin(pluginId: str) -> str:
        """Inspect one UI plugin's authoritative declaration and composition state."""
        try:
            return _render_result(await client.inspect_ui_plugin(pluginId))
        except ProjectControlError as error:
            return _render_error(error)

    @tool("inspect_ui_services")
    async def inspect_ui_services() -> str:
        """Inspect declared Service providers, required consumers, optional consumers, and current availability."""
        try:
            result = await client.inspect_ui_services()
            observe(result.get("appUIModelHash"), "inspect_ui_services")
            return _render_result(result)
        except ProjectControlError as error:
            return _render_error(error)

    @tool("inspect_ui_plugin_source_references")
    async def inspect_ui_plugin_source_references(pluginId: str) -> str:
        """Locate one UI plugin's authoritative source entry and related files."""
        try:
            return _render_result(
                await client.inspect_ui_plugin_source_references(pluginId)
            )
        except ProjectControlError as error:
            return _render_error(error)

    @tool("inspect_agent_ui_sources")
    async def inspect_agent_ui_sources() -> str:
        """Inspect Agent UI source-registry ownership, versions, dependencies, and safe apply state."""
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
