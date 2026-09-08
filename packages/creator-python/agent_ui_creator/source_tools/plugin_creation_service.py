from __future__ import annotations

import json
import re
from pathlib import Path, PurePosixPath

from ..files import resolve_creator_project_file
from .models import (
    PluginCreationResult,
    SourceCreationError,
    UIPluginSourceFile,
    UISourceFile,
)
from .source_creation_service import UISourceCreationService


_PLUGIN_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,99}$")
_REQUIRED_PLUGIN_FILES = frozenset({"manifest.json", "definition.ts", "index.tsx"})


class UIPluginCreationService:
    """Validate one new Plugin and delegate its atomic writes to the source primitive."""

    def __init__(
        self,
        *,
        project_root: str | Path,
        source_creation: UISourceCreationService,
    ) -> None:
        self.project_root = Path(project_root).resolve()
        self.source_creation = source_creation

    @staticmethod
    def _normalize_relative_path(relative_path: str) -> str:
        if (
            not relative_path
            or relative_path != relative_path.strip()
            or relative_path.startswith("/")
            or "\\" in relative_path
            or "\x00" in relative_path
            or ".." in PurePosixPath(relative_path).parts
        ):
            raise SourceCreationError(
                "PLUGIN_PATH_INVALID",
                "Plugin file relativePath must stay inside the Plugin directory.",
                {"relativePath": relative_path},
            )
        normalized = PurePosixPath(relative_path).as_posix()
        if normalized in {"", "."}:
            raise SourceCreationError(
                "PLUGIN_PATH_INVALID",
                "Plugin file relativePath must name a file inside the Plugin directory.",
                {"relativePath": relative_path},
            )
        return normalized

    async def create(
        self, plugin_id: str, files: list[UIPluginSourceFile]
    ) -> PluginCreationResult:
        if _PLUGIN_ID_PATTERN.fullmatch(plugin_id) is None:
            raise SourceCreationError(
                "PLUGIN_ID_INVALID",
                "pluginId must match ^[a-z0-9][a-z0-9-]{0,99}$.",
                {"pluginId": plugin_id},
            )

        plugin_directory = f"/plugins/{plugin_id}"
        if resolve_creator_project_file(
            self.project_root, plugin_directory
        ).absolute_path.exists():
            raise SourceCreationError(
                "PLUGIN_ALREADY_EXISTS",
                f"Plugin directory already exists: plugins/{plugin_id}",
                {"pluginId": plugin_id, "path": f"plugins/{plugin_id}"},
            )

        normalized_files: dict[str, str] = {}
        for source in files:
            relative_path = self._normalize_relative_path(source.relativePath)
            if relative_path in normalized_files:
                raise SourceCreationError(
                    "PLUGIN_FILE_DUPLICATE",
                    "Plugin creation contains duplicate normalized relative paths.",
                    {"relativePath": relative_path},
                )
            normalized_files[relative_path] = source.content

        missing_paths = sorted(_REQUIRED_PLUGIN_FILES.difference(normalized_files))
        if missing_paths:
            raise SourceCreationError(
                "PLUGIN_REQUIRED_FILE_MISSING",
                "A new Plugin must include manifest.json, definition.ts, and index.tsx.",
                {"missingRelativePaths": missing_paths},
            )

        try:
            manifest = json.loads(normalized_files["manifest.json"])
        except json.JSONDecodeError as error:
            raise SourceCreationError(
                "PLUGIN_MANIFEST_INVALID",
                "Plugin manifest.json must contain valid JSON.",
                {"relativePath": "manifest.json", "cause": str(error)},
            ) from error
        if not isinstance(manifest, dict):
            raise SourceCreationError(
                "PLUGIN_MANIFEST_INVALID",
                "Plugin manifest.json must contain a JSON object.",
                {"relativePath": "manifest.json"},
            )
        if manifest.get("id") != plugin_id:
            raise SourceCreationError(
                "PLUGIN_MANIFEST_ID_MISMATCH",
                "Plugin manifest.id must exactly equal pluginId.",
                {
                    "pluginId": plugin_id,
                    "manifestId": manifest.get("id"),
                },
            )

        source_files = [
            UISourceFile(
                path=f"{plugin_directory}/{relative_path}",
                content=content,
            )
            for relative_path, content in normalized_files.items()
        ]
        try:
            result = await self.source_creation.create(
                source_files,
                require_absent_directory=plugin_directory,
            )
        except SourceCreationError as error:
            if error.code == "SOURCE_DIRECTORY_ALREADY_EXISTS":
                raise SourceCreationError(
                    "PLUGIN_ALREADY_EXISTS",
                    f"Plugin directory already exists: plugins/{plugin_id}",
                    {"pluginId": plugin_id, "path": f"plugins/{plugin_id}"},
                ) from error
            raise
        return PluginCreationResult(
            plugin_id=plugin_id,
            created_paths=result.created_paths,
            mutation_revision=result.mutation_revision,
        )
