from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Literal, TypeAlias

OPERATOR_ENTRY_PATH = ".agent-ui/operator/entry.mjs"
OPERATOR_TIMEOUT_SECONDS = 15.0
MAX_OPERATOR_OUTPUT_BYTES = 1_000_000

ReadOperatorOperation: TypeAlias = Literal[
    "plan_plugin_source_takeover",
    "plan_agent_ui_integration",
    "verify_agent_ui_integration",
    "inspect_ui_project",
    "inspect_app_ui_model",
    "inspect_app_ui_model_source",
    "list_ui_plugins",
    "inspect_ui_slots",
    "inspect_ui_plugin",
    "preflight_ui_plugin_placement",
    "inspect_ui_services",
    "inspect_ui_plugin_source_references",
    "inspect_agent_ui_sources",
]

MutationOperatorOperation: TypeAlias = Literal[
    "takeover_plugin_source",
    "apply_agent_ui_integration",
    "prepare_agent_ui_integration_asset",
    "mutate_app_ui_model",
    "repair_app_ui_model",
    "apply_agent_ui_source_item",
    "remove_agent_ui_source_items",
    "purge_ui_plugin",
    "create_custom_plugin",
    "migrate_official_package_plugin",
    "synchronize_plugin_registry",
]
InternalOperatorOperation: TypeAlias = Literal[
    "verify_runtime_composition",
    "verify_ui_project",
]
OperatorOperation: TypeAlias = (
    ReadOperatorOperation
    | MutationOperatorOperation
    | InternalOperatorOperation
)


@dataclass(slots=True)
class OperatorMetrics:
    requests: int = 0
    requestsByOperation: dict[str, int] = field(default_factory=dict)
    failures: int = 0
    durationMs: int = 0
    queueWaitMs: int = 0
    admissionWaitMs: int = 0
    executionMs: int = 0

    def record(self, operation: OperatorOperation, duration_ms: int, failed: bool) -> None:
        self.requests += 1
        self.requestsByOperation[operation] = self.requestsByOperation.get(operation, 0) + 1
        self.durationMs += duration_ms
        self.failures += int(failed)

    def to_dict(self) -> dict[str, object]:
        value = asdict(self)
        value["byOperation"] = value.pop("requestsByOperation")
        return value
