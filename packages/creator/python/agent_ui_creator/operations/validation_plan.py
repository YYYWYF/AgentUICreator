from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Mapping


ValidationLevel = Literal["ui-model", "target-source", "workspace"]


@dataclass(frozen=True, slots=True)
class MutationFootprint:
    app_ui_model: bool
    plugin_config: bool
    generated_registry: bool
    source_files: bool
    runtime_files: bool
    dependencies: bool
    workspace_infrastructure: bool

    @classmethod
    def from_dict(cls, value: Any) -> MutationFootprint:
        fields = {
            "appUIModel": "app_ui_model",
            "pluginConfig": "plugin_config",
            "generatedRegistry": "generated_registry",
            "sourceFiles": "source_files",
            "runtimeFiles": "runtime_files",
            "dependencies": "dependencies",
            "workspaceInfrastructure": "workspace_infrastructure",
        }
        if not isinstance(value, Mapping) or set(value) != set(fields) or any(
            type(value[key]) is not bool for key in fields
        ):
            raise ValueError("The Host did not report a valid mutation footprint.")
        return cls(**{field: value[key] for key, field in fields.items()})

    def to_dict(self) -> dict[str, bool]:
        return {
            "appUIModel": self.app_ui_model,
            "pluginConfig": self.plugin_config,
            "generatedRegistry": self.generated_registry,
            "sourceFiles": self.source_files,
            "runtimeFiles": self.runtime_files,
            "dependencies": self.dependencies,
            "workspaceInfrastructure": self.workspace_infrastructure,
        }


def plan_validation(footprint: MutationFootprint) -> ValidationLevel:
    if footprint.workspace_infrastructure or footprint.dependencies:
        return "workspace"
    if footprint.source_files or footprint.runtime_files:
        return "target-source"
    return "ui-model"
