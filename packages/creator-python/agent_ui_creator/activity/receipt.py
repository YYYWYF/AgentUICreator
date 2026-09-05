from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True, slots=True)
class CreatorFileChangeReceipt:
    path: str
    status: Literal["created", "modified", "deleted"]
    diff: str
    truncated: bool

    def to_dict(self) -> dict[str, object]:
        return {
            "path": self.path,
            "status": self.status,
            "diff": self.diff,
            "truncated": self.truncated,
        }
