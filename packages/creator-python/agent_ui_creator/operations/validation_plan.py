from __future__ import annotations

from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Any, Literal, Mapping


ValidationLevel = Literal["ui-model", "target-source", "workspace"]


@dataclass(frozen=True, slots=True)
class MutationFootprint:
    changed_paths: tuple[str, ...]
    app_ui_model: bool
    plugin_config: bool
    generated_registry: bool
    source_files: bool
    workspace_infrastructure: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "changedFiles": list(self.changed_paths),
            "appUIModel": self.app_ui_model,
            "pluginConfig": self.plugin_config,
            "generatedRegistry": self.generated_registry,
            "sourceFiles": self.source_files,
            "workspaceInfrastructure": self.workspace_infrastructure,
        }


def footprint_from_mutation(
    mutation: Mapping[str, Any], *, app_ui_model_path: str
) -> MutationFootprint:
    """Classify the Host's committed paths, never the selected action name."""

    paths = mutation.get("changedPaths")
    if not isinstance(paths, list) or not paths or any(
        not isinstance(item, str) or not item for item in paths
    ):
        raise ValueError("The Host did not report committed mutation paths.")
    normalized = tuple(path.replace("\\", "/") for path in paths)
    model_path = app_ui_model_path.replace("\\", "/")
    model = model_path in normalized
    plugin_config = False
    generated = False
    source = False
    workspace = False
    for item in normalized:
        parts = PurePosixPath(item).parts
        if item.startswith("/") or ".." in parts:
            workspace = True
            continue
        if item == model_path or item == str(
            PurePosixPath(model_path).parent / "composition-revision.generated.json"
        ):
            continue
        if (
            not parts
            or parts[0] in {"packages", "apps", "scripts", "contracts"}
            or PurePosixPath(item).name in {"package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.json", "vite.config.ts"}
        ):
            workspace = True
        elif item.endswith("registry.generated.ts") or item.endswith("registry.generated.tsx"):
            generated = True
        elif item.startswith("app-ui/") and PurePosixPath(item).suffix == ".json":
            model = True
        elif item.startswith("plugins/") and PurePosixPath(item).name == "config.json":
            plugin_config = True
        elif PurePosixPath(item).suffix in {".ts", ".tsx", ".js", ".jsx", ".css"}:
            source = True
        else:
            workspace = True
    return MutationFootprint(normalized, model, plugin_config, generated, source, workspace)


def plan_validation(footprint: MutationFootprint) -> ValidationLevel:
    if footprint.workspace_infrastructure:
        return "workspace"
    if footprint.source_files:
        return "target-source"
    return "ui-model"
