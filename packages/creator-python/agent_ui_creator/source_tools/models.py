from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


MAX_SOURCE_FILES_PER_CALL = 100
MAX_SOURCE_FILE_CHARACTERS = 1_000_000
MAX_SOURCE_TOTAL_BYTES = 5_000_000


class UISourceFile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    path: str = Field(min_length=1, max_length=1_000)
    content: str = Field(max_length=MAX_SOURCE_FILE_CHARACTERS)


class CreateUISourceFilesInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    files: list[UISourceFile] = Field(
        min_length=1,
        max_length=MAX_SOURCE_FILES_PER_CALL,
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


@dataclass(frozen=True, slots=True)
class SourceCreationResult:
    created_paths: tuple[str, ...]
    mutation_revision: int

    def to_dict(self) -> dict[str, object]:
        return {
            "createdPaths": list(self.created_paths),
            "mutationRevision": self.mutation_revision,
        }
