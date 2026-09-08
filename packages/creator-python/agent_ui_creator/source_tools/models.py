from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field


MAX_SOURCE_FILES_PER_CALL = 100
MAX_PLUGIN_MUTATION_FILES_PER_CALL = 20
MAX_PLUGIN_MUTATION_EDITS_PER_CALL = 100
MAX_SOURCE_FILE_CHARACTERS = 1_000_000
MAX_SOURCE_TOTAL_BYTES = 5_000_000


class UISourceFile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    path: str = Field(min_length=1, max_length=1_000)
    content: str = Field(max_length=MAX_SOURCE_FILE_CHARACTERS)


class UIPluginSourceFile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    relativePath: str = Field(min_length=1, max_length=1_000)
    content: str = Field(max_length=MAX_SOURCE_FILE_CHARACTERS)


class CreateUIPluginInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pluginId: str = Field(min_length=1, max_length=100)
    files: list[UIPluginSourceFile] = Field(
        min_length=1,
        max_length=MAX_SOURCE_FILES_PER_CALL,
    )


class PluginSourceEdit(BaseModel):
    model_config = ConfigDict(extra="forbid")

    oldText: str = Field(min_length=1, max_length=MAX_SOURCE_FILE_CHARACTERS)
    newText: str = Field(max_length=MAX_SOURCE_FILE_CHARACTERS)
    replaceAll: bool = False


class EditUIPluginSourceChange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["edit"]
    relativePath: str = Field(min_length=1, max_length=1_000)
    edits: list[PluginSourceEdit] = Field(min_length=1)


class CreateUIPluginSourceChange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["create"]
    relativePath: str = Field(min_length=1, max_length=1_000)
    content: str = Field(max_length=MAX_SOURCE_FILE_CHARACTERS)


UIPluginSourceChange = Annotated[
    EditUIPluginSourceChange | CreateUIPluginSourceChange,
    Field(discriminator="type"),
]


class MutateUIPluginSourceInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pluginId: str = Field(min_length=1, max_length=100)
    changes: list[UIPluginSourceChange] = Field(
        min_length=1,
        max_length=MAX_PLUGIN_MUTATION_FILES_PER_CALL,
    )


class SourceCreationError(RuntimeError):
    def __init__(
        self,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.details = details


class PluginSourceMutationError(RuntimeError):
    def __init__(
        self,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.details = details


@dataclass(frozen=True, slots=True)
class SourceCreationResult:
    created_paths: tuple[str, ...]
    mutation_revision: int

    def to_dict(self) -> dict[str, object]:
        return {
            "createdPaths": list(self.created_paths),
            "mutationRevision": self.mutation_revision,
        }


@dataclass(frozen=True, slots=True)
class PluginCreationResult:
    plugin_id: str
    created_paths: tuple[str, ...]
    mutation_revision: int

    def to_dict(self) -> dict[str, object]:
        return {
            "pluginId": self.plugin_id,
            "created": True,
            "createdPaths": list(self.created_paths),
            "mutationRevision": self.mutation_revision,
        }


@dataclass(frozen=True, slots=True)
class PluginSourceMutationResult:
    plugin_id: str
    changed_paths: tuple[str, ...]
    modified_paths: tuple[str, ...]
    created_paths: tuple[str, ...]
    mutation_revision: int

    def to_dict(self) -> dict[str, object]:
        return {
            "pluginId": self.plugin_id,
            "changed": bool(self.changed_paths),
            "changedPaths": list(self.changed_paths),
            "modifiedPaths": list(self.modified_paths),
            "createdPaths": list(self.created_paths),
            "mutationRevision": self.mutation_revision,
        }
