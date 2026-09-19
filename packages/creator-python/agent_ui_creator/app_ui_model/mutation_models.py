from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal

APP_UI_MODEL_PATH = "app-ui/app-ui.json"
COMPOSITION_REVISION_PATH = "app-ui/composition-revision.generated.json"
REGISTRY_PATH = "plugins/registry.generated.ts"
MUTABLE_PATHS = (
    APP_UI_MODEL_PATH,
    COMPOSITION_REVISION_PATH,
    REGISTRY_PATH,
)
MAX_MUTATION_RESULT_CHARACTERS = 48_000
MAX_SEMANTIC_COMPOSITION_REPLANS = 1

MutationErrorCategory = Literal[
    "stale_state",
    "operation_precondition",
    "workspace_integrity",
    "infrastructure",
]

_STALE_STATE_CODES = frozenset(
    {
        "APP_UI_MODEL_HASH_CONFLICT",
        "APP_UI_MODEL_OBSERVATION_REQUIRED",
        "CREATOR_ACTION_NOT_AVAILABLE",
    }
)
_WORKSPACE_INTEGRITY_CODES = frozenset(
    {
        "PLUGIN_CHILD_SLOT_CONTRACT_INVALID",
        "PLUGIN_REGISTRY_GENERATION_FAILED",
        "CREATOR_ACTION_CATALOG_TOO_LARGE",
    }
)
_OPERATION_PRECONDITION_CODES = frozenset(
    {
        "APP_UI_MODEL_INVALID",
        "APP_UI_MODEL_OBSERVATION_HASH_MISMATCH",
        "PLUGIN_ALREADY_EXISTS",
        "PLUGIN_NOT_FOUND",
        "PLUGIN_WIDTH_INCOMPATIBLE",
        "AUTHORING_DEFAULT_PLACEMENT_UNAVAILABLE",
        "AUTHORING_DEFAULT_PLACEMENT_AMBIGUOUS",
        "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
        "AUTHORING_MOVE_UNSUPPORTED",
        "AUTHORING_MOVE_INCOMPATIBLE",
        "SEMANTIC_OPERATION_NOT_LOWERED",
        "CREATOR_ACTION_TRANSACTION_INVALID",
        "CREATOR_ACTION_CATALOG_INVALID",
    }
)
_OPERATION_PRECONDITION_PREFIXES = (
    "DUPLICATE_LAYOUT_",
    "INDEX_",
    "LAYOUT_",
)


def classify_mutation_error(code: str) -> MutationErrorCategory:
    if code in _STALE_STATE_CODES:
        return "stale_state"
    if code in _WORKSPACE_INTEGRITY_CODES:
        return "workspace_integrity"
    if code in _OPERATION_PRECONDITION_CODES or code.startswith(
        _OPERATION_PRECONDITION_PREFIXES
    ):
        return "operation_precondition"
    return "infrastructure"


def mutation_error_recovery(
    category: MutationErrorCategory,
) -> dict[str, object]:
    if category == "stale_state":
        return {
            "action": "inspect_current_state",
            "atomicRetryAllowed": True,
            "semanticReplanConsumed": False,
        }
    if category == "operation_precondition":
        return {
            "action": "reform_semantic_delta",
            "atomicRetryAllowed": True,
            "maxSemanticReplans": MAX_SEMANTIC_COMPOSITION_REPLANS,
        }
    if category == "workspace_integrity":
        return {
            "action": "stop_and_report_blocker",
            "atomicRetryAllowed": False,
            "automaticCrossLayerRepairAllowed": False,
        }
    return {
        "action": "follow_infrastructure_policy",
        "atomicRetryAllowed": False,
        "automaticCrossLayerRepairAllowed": False,
    }


class AppUIModelMutationError(RuntimeError):
    code: str
    details: Any
    category: MutationErrorCategory
    state_changed: bool
    observation_still_valid: bool
    recovery: dict[str, object]

    def __init__(
        self,
        code: str,
        message: str,
        details: Any = None,
        *,
        category: MutationErrorCategory | None = None,
        state_changed: bool = False,
        observation_still_valid: bool | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.details = details
        self.category = category or classify_mutation_error(code)
        self.state_changed = state_changed
        self.observation_still_valid = (
            not state_changed and self.category != "stale_state"
            if observation_still_valid is None
            else observation_still_valid
        )
        self.recovery = mutation_error_recovery(self.category)

    def with_disk_state(self, *, state_changed: bool) -> AppUIModelMutationError:
        category: MutationErrorCategory = (
            "infrastructure" if state_changed else self.category
        )
        return AppUIModelMutationError(
            self.code,
            str(self),
            self.details,
            category=category,
            state_changed=state_changed,
            observation_still_valid=(
                not state_changed and self.category != "stale_state"
            ),
        )

    def semantics(self) -> dict[str, object]:
        return {
            "category": self.category,
            "stateChanged": self.state_changed,
            "observationStillValid": self.observation_still_valid,
            "recovery": dict(self.recovery),
        }


@dataclass(slots=True)
class AppUIModelMutationMetrics:
    requests: int = 0
    operations: int = 0
    hashConflicts: int = 0
    changedPaths: int = 0
    resultMismatches: int = 0
    operationsPerMutation: list[int] = field(default_factory=list)
    successfulRequests: int = 0
    errorCategories: dict[str, int] = field(default_factory=dict)
    semanticReplans: int = 0
    semanticFailures: int = 0
    semanticReplanLimitReached: bool = False

    def begin_request(self, operation_count: int) -> int:
        self.requests += 1
        self.operations += operation_count
        self.operationsPerMutation.append(operation_count)
        return self.requests

    def summary(self) -> dict[str, Any]:
        return {
            "mutationRequests": self.requests,
            "mutationOperations": self.operations,
            "operationsPerMutation": list(self.operationsPerMutation),
            "multiSuccessfulMutationRun": self.successfulRequests >= 2,
            "mutationErrorCategories": dict(self.errorCategories),
            "semanticReplans": self.semanticReplans,
            "semanticReplanLimitReached": self.semanticReplanLimitReached,
        }

    def to_dict(self) -> dict[str, Any]:
        return {**asdict(self), "multiSuccessfulMutationRun": self.successfulRequests >= 2}


@dataclass(frozen=True, slots=True)
class AppUIModelMutationResult:
    target_result: dict[str, Any]
    mutation_revision: int

    def to_dict(self) -> dict[str, Any]:
        return {
            **self.target_result,
            "mutationRevision": self.mutation_revision,
        }
