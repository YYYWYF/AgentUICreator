from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


CreatorTransactionFileStatus = Literal["created", "modified", "deleted"]


@dataclass(frozen=True, slots=True)
class CreatorTransactionFileInput:
    path: str
    before: str | None
    after: str | None


@dataclass(frozen=True, slots=True)
class CreatorTransactionFileState:
    exists: bool
    hash: str
    content: str | None = None

    def to_dict(self, *, include_content: bool) -> dict[str, object]:
        result: dict[str, object] = {"exists": self.exists, "hash": self.hash}
        if include_content and self.exists:
            result["content"] = self.content
        return result


@dataclass(frozen=True, slots=True)
class CreatorTransactionFileRecord:
    path: str
    status: CreatorTransactionFileStatus
    before: CreatorTransactionFileState
    after: CreatorTransactionFileState

    def to_dict(self) -> dict[str, object]:
        return {
            "path": self.path,
            "status": self.status,
            "before": self.before.to_dict(include_content=True),
            "after": self.after.to_dict(include_content=False),
        }


@dataclass(frozen=True, slots=True)
class CreatorTransactionRecord:
    schema_version: int
    run_id: str
    created_at: str
    mutation_revision: int
    validation_revision: int | None
    files: tuple[CreatorTransactionFileRecord, ...]

    def to_dict(self) -> dict[str, object]:
        return {
            "schemaVersion": self.schema_version,
            "runId": self.run_id,
            "createdAt": self.created_at,
            "mutationRevision": self.mutation_revision,
            "validationRevision": self.validation_revision,
            "files": [file.to_dict() for file in self.files],
        }


@dataclass(frozen=True, slots=True)
class CreatorTransactionConflict:
    path: str
    expected_after_hash: str
    actual_hash: str

    def to_dict(self) -> dict[str, str]:
        return {
            "path": self.path,
            "expectedAfterHash": self.expected_after_hash,
            "actualHash": self.actual_hash,
        }


@dataclass(frozen=True, slots=True)
class CreatorTransactionStatus:
    run_id: str
    undoable: bool
    conflicts: tuple[CreatorTransactionConflict, ...]

    def to_dict(self) -> dict[str, object]:
        return {
            "runId": self.run_id,
            "undoable": self.undoable,
            "conflicts": [conflict.to_dict() for conflict in self.conflicts],
        }


@dataclass(frozen=True, slots=True)
class CreatorUndoResult:
    run_id: str
    changed_paths: tuple[str, ...]
    record: CreatorTransactionRecord

    def to_dict(self) -> dict[str, object]:
        return {
            "runId": self.run_id,
            "changedPaths": list(self.changed_paths),
            "record": self.record.to_dict(),
        }
