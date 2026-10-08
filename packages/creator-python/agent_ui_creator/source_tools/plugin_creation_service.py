from __future__ import annotations

import json
import re
from pathlib import Path, PurePosixPath

from ..activity import CreatorActivityRecorder
from ..files import resolve_creator_project_file
from ..project_paths import agent_ui_source_path
from ..plugin_development.authority import PluginDevelopmentAuthority, PluginDevelopmentError
from ..project_control import ProjectControlClient, ProjectControlError
from .models import (
    PluginCreationResult,
    SourceCreationError,
    UIPluginSourceFile,
    UISourceFile,
)
from .source_creation_service import UISourceCreationService


_PLUGIN_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,99}$")
_REQUIRED_PLUGIN_FILES = frozenset({"manifest.json", "definition.ts", "index.tsx"})
_STYLESHEET_IMPORT = re.compile(r"\bimport\s*(?:\(\s*)?['\"]\./styles\.css['\"]")
_PROJECT_ROOT_IMPORT = re.compile(
    r"(?P<prefix>\bfrom\s*[\"']|\bimport\s*[\"'])"
    r"(?P<wrong>\.\./(?P<domain>agent-ui|framework|services)/(?P<rest>[^\"']+))"
)
_BUILTIN_SERVICE_BARREL_IMPORT = re.compile(
    r"(?P<prefix>\bimport\s*\{\s*(?P<symbol>AGENT_UI_LOCALE_SERVICE|AGENT_UI_THEME_SERVICE)"
    r"\s*\}\s*from\s*)(?P<quote>[\"'])(?P<wrong>\.\./(?:\.\./)?services)(?P=quote)"
)
_BUILTIN_SERVICE_MODULES = {
    "AGENT_UI_LOCALE_SERVICE": "agent-ui-locale",
    "AGENT_UI_THEME_SERVICE": "agent-ui-theme",
}
_BUILTIN_HOOK_SERVICES = {
    "useAgentUILocale": "AGENT_UI_LOCALE_SERVICE",
    "useAgentUITheme": "AGENT_UI_THEME_SERVICE",
}


class UIPluginCreationService:
    """Validate one new Plugin and delegate its atomic writes to the source primitive."""

    def __init__(
        self,
        *,
        project_root: str | Path,
        source_creation: UISourceCreationService,
        activity: CreatorActivityRecorder,
        development_authority: PluginDevelopmentAuthority | None = None,
        project_control: ProjectControlClient | None = None,
        internal_trusted: bool = False,
    ) -> None:
        self.project_root = Path(project_root).resolve()
        self.source_creation = source_creation
        self.activity = activity
        self.development_authority = development_authority
        self.project_control = project_control
        self.internal_trusted = internal_trusted

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

        if plugin_id == "assistant-ui-composer":
            raise SourceCreationError("PLUGIN_ID_RESERVED_BY_OFFICIAL", "Official Composer is dependency-owned; choose a new project-owned ID.")
        plugin_directory = f"/plugins/{plugin_id}"
        if resolve_creator_project_file(
            self.project_root, agent_ui_source_path(self.project_root, plugin_directory[1:])
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

        normalized_imports: list[tuple[str, str, str]] = []
        plugin_root = resolve_creator_project_file(
            self.project_root,
            agent_ui_source_path(self.project_root, f"plugins/{plugin_id}"),
        ).absolute_path
        for relative_path in ("definition.ts", "index.tsx"):
            content = normalized_files[relative_path]

            def correct_project_import(match: re.Match[str]) -> str:
                domain = match.group("domain")
                project_directory = plugin_root.parent.parent / domain
                sibling_directory = plugin_root.parent / domain
                if not project_directory.is_dir() or sibling_directory.exists():
                    return match.group(0)
                wrong = match.group("wrong")
                corrected = f"../../{domain}/{match.group('rest')}"
                normalized_imports.append((relative_path, wrong, corrected))
                return match.group("prefix") + corrected

            normalized_files[relative_path] = _PROJECT_ROOT_IMPORT.sub(
                correct_project_import, content
            )

        definition = normalized_files["definition.ts"]

        def correct_builtin_service_import(match: re.Match[str]) -> str:
            module = _BUILTIN_SERVICE_MODULES[match.group("symbol")]
            if not (plugin_root.parent.parent / "services" / f"{module}.ts").is_file():
                return match.group(0)
            corrected = f"../../services/{module}"
            normalized_imports.append(("definition.ts", match.group("wrong"), corrected))
            return match.group("prefix") + match.group("quote") + corrected + match.group("quote")

        normalized_files["definition.ts"] = _BUILTIN_SERVICE_BARREL_IMPORT.sub(
            correct_builtin_service_import, definition
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

        data = manifest.get("data")
        if "data" in manifest and (
            not isinstance(data, dict)
            or any(key not in {"messages", "state", "messageUI", "events"} for key in data)
            or any(type(data[key]) is not bool for key in ("messages", "state", "messageUI") if key in data)
            or ("events" in data and not (
                isinstance(data["events"], list)
                and all(isinstance(item, str) for item in data["events"])
            ))
        ):
            raise SourceCreationError(
                "PLUGIN_MANIFEST_DATA_INVALID",
                "Plugin manifest.data accepts boolean messages/state/messageUI and a string[] events. "
                "React-local useState does not require data.state.",
                {"relativePath": "manifest.json"},
            )

        if "styles.css" in normalized_files and not any(
            _STYLESHEET_IMPORT.search(content)
            for relative_path, content in normalized_files.items()
            if relative_path.endswith((".ts", ".tsx", ".js", ".jsx"))
        ):
            raise SourceCreationError(
                "PLUGIN_STYLESHEET_NOT_IMPORTED",
                "Plugin styles.css must be imported by Plugin source so its styles reach the Host.",
                {"relativePath": "styles.css"},
            )

        definition = normalized_files["definition.ts"]
        plugin_source = "\n".join(
            content for name, content in normalized_files.items()
            if name.endswith((".ts", ".tsx", ".js", ".jsx"))
            and name != "definition.ts"
        )
        contract_path = plugin_root.parent.parent / "framework/contracts/ui-plugin.ts"
        unsupported_builder = (
            re.search(r"\bdefineUIPlugin\s*\(", definition) is not None
            and contract_path.is_file()
            and "defineUIPlugin" not in contract_path.read_text(encoding="utf-8")
        )
        misplaced_contract_fields = (
            re.search(r"\bcomponent\s*:", definition) is not None
            or re.search(r"\bservices\s*:\s*\{", definition) is not None
        )
        if not self.internal_trusted and (unsupported_builder or misplaced_contract_fields):
            raise SourceCreationError(
                "PLUGIN_DEFINITION_CONTRACT_INVALID",
                "definition.ts does not match this project's UIPluginDefinition contract. "
                "Reissue create_ui_plugin with a plain definition object containing "
                "Component (capital C), manifest, and top-level inject/optionalInject as needed. "
                "Do not call validate_creator_changes or compose before creation succeeds; "
                "no Plugin files were written.",
                {"relativePath": "definition.ts"},
            )
        for hook, service in _BUILTIN_HOOK_SERVICES.items():
            if not re.search(rf"\b{hook}\s*\(", plugin_source):
                continue
            declared = re.search(
                rf"\b(?:inject|optionalInject)\s*:\s*\[[^\]]*\b{service}\b",
                definition,
                re.DOTALL,
            )
            if declared is None:
                raise SourceCreationError(
                    "PLUGIN_BUILTIN_SERVICE_UNDECLARED",
                    f"A Plugin using {hook} must declare {service} in definition.ts inject or optionalInject.",
                    {"relativePath": "definition.ts", "hook": hook, "service": service},
                )

        source_files = [
            UISourceFile(
                path=f"{plugin_directory}/{relative_path}",
                content=content,
            )
            for relative_path, content in normalized_files.items()
        ]
        try:
            async def admission() -> None:
                if self.internal_trusted:
                    return
                try:
                    if self.development_authority is None:
                        raise PluginDevelopmentError("新 Plugin 开发缺少服务端授权。")
                    self.development_authority.require_create(plugin_id)
                except PluginDevelopmentError as error:
                    raise SourceCreationError(error.code, str(error)) from error

                # The manifest is still only a candidate. Reuse the same Host
                # planner that will lower insert_plugin_default after creation.
                if self.project_control is not None and isinstance(
                    manifest.get("authoring"), dict
                ) and manifest["authoring"].get("defaultPlacement") is not None:
                    try:
                        inspection = await self.project_control.inspect_ui_project()
                        model_hash = inspection.get("appUIModel", {}).get("hash")
                        catalog_revision = inspection.get("capabilityCatalog", {}).get("revision")
                        if not isinstance(model_hash, str) or not isinstance(catalog_revision, str):
                            raise SourceCreationError(
                                "PLUGIN_PLACEMENT_FACTS_UNAVAILABLE",
                                "Current AppUIModel and capability catalog revisions are required before creating a placed Plugin.",
                                {"relativePath": "manifest.json"},
                            )
                        placement = await self.project_control.preflight_ui_plugin_placement(
                            app_ui_model_hash=model_hash,
                            capability_catalog_revision=catalog_revision,
                            instance_id=f"{plugin_id}-main",
                            manifest=manifest,
                        )
                    except ProjectControlError as error:
                        raise SourceCreationError(
                            "PLUGIN_PLACEMENT_PREFLIGHT_FAILED",
                            str(error),
                            {"relativePath": "manifest.json", "causeCode": error.code, "causeDetails": error.details},
                        ) from error
                    if placement.get("eligible") is not True:
                        diagnostic = placement.get("diagnostic")
                        responsive_drawer_conflict = (
                            isinstance(diagnostic, dict)
                            and diagnostic.get("code") == "RESPONSIVE_DRAWER_PLACEMENT_INVALID"
                        )
                        raise SourceCreationError(
                            "PLUGIN_PLACEMENT_INELIGIBLE",
                            "The proposed Plugin cannot use its declared defaultPlacement in the current Composition. "
                            + ("No Plugin files were created. Reissue create_ui_plugin with "
                               "manifest.authoring.defaultPlacement after the primary conversation region; "
                               "wait for successful creation before validation or composition."
                               if responsive_drawer_conflict else ""),
                            {"relativePath": "manifest.json", "diagnostic": diagnostic},
                        )

            result = await self.source_creation.create(
                source_files,
                require_absent_directory=plugin_directory,
                preflight=admission,
            )
        except SourceCreationError as error:
            if error.code == "SOURCE_DIRECTORY_ALREADY_EXISTS":
                raise SourceCreationError(
                    "PLUGIN_ALREADY_EXISTS",
                    f"Plugin directory already exists: plugins/{plugin_id}",
                    {"pluginId": plugin_id, "path": f"plugins/{plugin_id}"},
                ) from error
            raise
        if not self.internal_trusted:
            assert self.development_authority is not None
            self.development_authority.mark_created(plugin_id)
        self.activity.record_created_directory(
            agent_ui_source_path(self.project_root, plugin_directory[1:]).lstrip("/")
        )
        return PluginCreationResult(
            plugin_id=plugin_id,
            created_paths=result.created_paths,
            mutation_revision=result.mutation_revision,
            normalized_imports=tuple(normalized_imports),
        )
