from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

APP_UI_MODEL_PATH = "app-ui/app-ui.json"
REGISTRY_PATH = "plugins/registry.generated.ts"
MUTABLE_PATHS = (APP_UI_MODEL_PATH, REGISTRY_PATH)
MAX_MUTATION_RESULT_CHARACTERS = 48_000


class AppUIModelMutationError(RuntimeError):
    code: str
    details: Any

    def __init__(self, code: str, message: str, details: Any = None) -> None:
        super().__init__(message)
        self.code = code
        self.details = details


@dataclass(slots=True)
class AppUIModelMutationMetrics:
    requests: int = 0
    operations: int = 0
    hashConflicts: int = 0
    changedPaths: int = 0
    resultMismatches: int = 0

    def to_dict(self) -> dict[str, int]:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class AppUIModelMutationResult:
    target_result: dict[str, Any]
    mutation_revision: int

    def to_dict(self) -> dict[str, Any]:
        return {
            **self.target_result,
            "mutationRevision": self.mutation_revision,
        }
