from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Literal, TypeAlias

PROJECT_CONTROL_SCHEMA_VERSION = 2
PROJECT_CONTROL_ENTRY_PATH = "scripts/ui-project-control.ts"
PROJECT_CONTROL_TIMEOUT_SECONDS = 15.0
MAX_PROJECT_CONTROL_OUTPUT_BYTES = 1_000_000

ReadProjectControlOperation: TypeAlias = Literal[
    "inspect_ui_project",
    "inspect_app_ui_model",
    "list_ui_plugins",
    "inspect_ui_slots",
    "inspect_ui_plugin",
    "inspect_ui_plugin_source_references",
]


@dataclass(slots=True)
class ProjectControlMetrics:
    requests: int = 0
    requestsByOperation: dict[str, int] = field(default_factory=dict)
    failures: int = 0
    durationMs: int = 0

    def record(self, operation: ReadProjectControlOperation, duration_ms: int, failed: bool) -> None:
        self.requests += 1
        self.requestsByOperation[operation] = self.requestsByOperation.get(operation, 0) + 1
        self.durationMs += duration_ms
        self.failures += int(failed)

    def to_dict(self) -> dict[str, object]:
        value = asdict(self)
        value["byOperation"] = value.pop("requestsByOperation")
        return value

