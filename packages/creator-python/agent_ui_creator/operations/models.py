from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Annotated, Any, Literal, TypeAlias

from pydantic import BaseModel, ConfigDict, Field, model_validator


MAX_PLUGIN_CAPABILITIES = 64
MAX_PLUGIN_INTENTS = 16
MAX_PLUGIN_INSTANCES = 32
MAX_TOTAL_PLUGIN_INSTANCES = 256
MAX_PLUGIN_ID_CHARS = 200
MAX_PLUGIN_INSTANCE_ID_CHARS = 200
MAX_PLUGIN_NAME_CHARS = 200
MAX_PLUGIN_DESCRIPTION_CHARS = 400
MAX_PLUGIN_INTENT_CHARS = 200
MAX_PLUGIN_VISUAL_ROLE_CHARS = 200
MAX_PLUGIN_ANCHOR_ID_CHARS = 200
MAX_PLUGIN_CAPABILITY_CHARS = 200
MAX_PLUGIN_CAPABILITY_TAGS = 16
MAX_PLUGIN_AUTHORING_SIZE_CHARS = 100
MAX_REQUIRED_SERVICE_STATUS_CHARS = 50
MAX_PLUGIN_CHILD_SLOTS = 16
MAX_CHILD_SLOT_NAME_CHARS = 100
MAX_CHILD_SLOT_DESCRIPTION_CHARS = 300
MAX_CHILD_SLOT_ACCEPTED_CAPABILITIES = 16
MAX_TOTAL_PLUGIN_CHILD_SLOTS = 256


CreatorOperationKind: TypeAlias = Literal[
    "add_existing_plugin",
    "remove_plugin",
    "move_plugin",
    "modify_plugin_logic",
    "general_change",
    "needs_clarification",
]
ProductizedOperationKind: TypeAlias = Literal[
    "add_existing_plugin",
    "remove_plugin",
    "move_plugin",
]
CreatorOperationExecutionStatus: TypeAlias = Literal[
    "success",
    "already_satisfied",
    "committed_unverified",
    "failed",
]
CreatorOperationRuntimeStatus: TypeAlias = Literal[
    "passed",
    "stale",
    "unavailable",
    "failed",
    "not-run",
]

PluginPlacementRelation: TypeAlias = Literal["before", "after", "above", "below"]
BoundedPluginId: TypeAlias = Annotated[
    str, Field(min_length=1, max_length=MAX_PLUGIN_ID_CHARS)
]
BoundedPluginInstanceId: TypeAlias = Annotated[
    str, Field(min_length=1, max_length=MAX_PLUGIN_INSTANCE_ID_CHARS)
]
BoundedPluginName: TypeAlias = Annotated[
    str, Field(min_length=1, max_length=MAX_PLUGIN_NAME_CHARS)
]
BoundedPluginDescription: TypeAlias = Annotated[
    str, Field(min_length=1, max_length=MAX_PLUGIN_DESCRIPTION_CHARS)
]
BoundedPluginIntent: TypeAlias = Annotated[
    str, Field(min_length=1, max_length=MAX_PLUGIN_INTENT_CHARS)
]
BoundedPluginVisualRole: TypeAlias = Annotated[
    str, Field(max_length=MAX_PLUGIN_VISUAL_ROLE_CHARS)
]
BoundedPluginAnchorId: TypeAlias = Annotated[
    str, Field(min_length=1, max_length=MAX_PLUGIN_ANCHOR_ID_CHARS)
]
BoundedPluginCapability: TypeAlias = Annotated[
    str, Field(min_length=1, max_length=MAX_PLUGIN_CAPABILITY_CHARS)
]
BoundedPluginChildSlotName: TypeAlias = Annotated[
    str, Field(min_length=1, max_length=MAX_CHILD_SLOT_NAME_CHARS)
]
BoundedPluginChildSlotDescription: TypeAlias = Annotated[
    str, Field(min_length=1, max_length=MAX_CHILD_SLOT_DESCRIPTION_CHARS)
]
BoundedAuthoringSizeString: TypeAlias = Annotated[
    str, Field(max_length=MAX_PLUGIN_AUTHORING_SIZE_CHARS)
]
AuthoringSize: TypeAlias = int | float | BoundedAuthoringSizeString
BoundedRequiredServiceStatus: TypeAlias = Annotated[
    str, Field(min_length=1, max_length=MAX_REQUIRED_SERVICE_STATUS_CHARS)
]


class PluginInstanceSummary(BaseModel):
    """The persistent authoring identity of one current Plugin instance."""

    model_config = ConfigDict(extra="forbid")

    instanceId: BoundedPluginInstanceId
    enabled: bool


class PluginDefaultPlacement(BaseModel):
    model_config = ConfigDict(extra="forbid")

    relation: PluginPlacementRelation
    anchorPluginId: BoundedPluginAnchorId


class RelativeMovePlacement(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["relative"]
    anchorPluginId: BoundedPluginAnchorId
    anchorInstanceId: BoundedPluginInstanceId
    relation: Literal["before", "after"]


class PluginSlotMovePlacement(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["plugin_slot"]
    parentPluginId: BoundedPluginId
    parentInstanceId: BoundedPluginInstanceId
    slot: BoundedPluginChildSlotName


CreatorMovePlacement: TypeAlias = Annotated[
    RelativeMovePlacement | PluginSlotMovePlacement,
    Field(discriminator="type"),
]


class PluginRecommendedSize(BaseModel):
    model_config = ConfigDict(extra="forbid")

    width: AuthoringSize | None = None
    height: AuthoringSize | None = None


class RequiredServiceSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: BoundedRequiredServiceStatus


class PluginChildSlotCapability(BaseModel):
    """Compact semantic metadata for one Plugin-owned child Slot."""

    model_config = ConfigDict(extra="forbid")

    name: BoundedPluginChildSlotName
    description: BoundedPluginChildSlotDescription
    cardinality: Literal["one", "many"]
    optional: bool
    acceptedCapabilities: list[BoundedPluginCapability] = Field(
        default_factory=list,
        max_length=MAX_CHILD_SLOT_ACCEPTED_CAPABILITIES,
    )


class PluginCapability(BaseModel):
    """Compact, resolver-facing capability metadata for one UI Plugin."""

    model_config = ConfigDict(extra="forbid")

    pluginId: BoundedPluginId
    name: BoundedPluginName
    description: BoundedPluginDescription
    capabilities: list[BoundedPluginCapability] = Field(
        default_factory=list,
        max_length=MAX_PLUGIN_CAPABILITY_TAGS,
    )
    intents: list[BoundedPluginIntent] = Field(
        default_factory=list, max_length=MAX_PLUGIN_INTENTS
    )
    visualRole: BoundedPluginVisualRole | None = None
    selected: bool
    instances: list[PluginInstanceSummary] = Field(
        default_factory=list, max_length=MAX_PLUGIN_INSTANCES
    )
    defaultPlacement: PluginDefaultPlacement | None = None
    recommendedSize: PluginRecommendedSize | None = None
    requiredServices: RequiredServiceSummary | None = None
    childSlots: list[PluginChildSlotCapability] = Field(
        default_factory=list,
        max_length=MAX_PLUGIN_CHILD_SLOTS,
    )


class PluginCapabilityIndex(BaseModel):
    """The bounded index shown to CreatorOperationResolver."""

    model_config = ConfigDict(extra="forbid")

    plugins: list[PluginCapability] = Field(
        default_factory=list, max_length=MAX_PLUGIN_CAPABILITIES
    )

    @model_validator(mode="after")
    def validate_total_instances(self) -> "PluginCapabilityIndex":
        total_instances = sum(len(plugin.instances) for plugin in self.plugins)
        if total_instances > MAX_TOTAL_PLUGIN_INSTANCES:
            raise ValueError(
                "The Plugin Capability Index exceeds the total instance limit."
            )
        return self

    @model_validator(mode="after")
    def validate_total_child_slots(self) -> "PluginCapabilityIndex":
        total_child_slots = sum(len(plugin.childSlots) for plugin in self.plugins)
        if total_child_slots > MAX_TOTAL_PLUGIN_CHILD_SLOTS:
            raise ValueError(
                "The Plugin Capability Index exceeds the total child Slot limit."
            )
        return self


class CreatorOperationResolution(BaseModel):
    """The only decision the first P1 resolver is allowed to make."""

    model_config = ConfigDict(extra="forbid")

    kind: CreatorOperationKind = Field(
        description=(
            "The productized operation kind. Choose general_change when the request "
            "needs unsupported layout or broader implementation work."
        )
    )
    targetPluginIds: list[str] = Field(
        default_factory=list,
        description="Existing Plugin ids involved in the request.",
    )
    targetInstanceIds: list[str] = Field(
        default_factory=list,
        description="Existing authoring instance ids involved in the request.",
    )
    placement: CreatorMovePlacement | None = Field(
        default=None,
        description=(
            "Supported move placement. Required only for move_plugin and must be "
            "null for every other operation kind."
        ),
    )
    clarificationQuestion: str | None = Field(
        default=None,
        description="A concise user question required only for needs_clarification.",
    )

    @model_validator(mode="after")
    def validate_clarification_question(self) -> "CreatorOperationResolution":
        if self.kind == "needs_clarification":
            if self.clarificationQuestion is None or not self.clarificationQuestion.strip():
                raise ValueError(
                    "clarificationQuestion is required for needs_clarification."
                )
        elif self.clarificationQuestion is not None and not self.clarificationQuestion.strip():
            raise ValueError("clarificationQuestion must not be blank.")
        if self.kind == "move_plugin" and self.placement is None:
            raise ValueError("placement is required for move_plugin.")
        if self.kind != "move_plugin" and self.placement is not None:
            raise ValueError("placement is only allowed for move_plugin.")
        return self


class CreatorOperationVerificationResult(BaseModel):
    """Host-only evidence produced after a Productized operation commits."""

    model_config = ConfigDict(extra="forbid")

    staticStatus: Literal["passed", "failed", "unavailable", "not-run"]
    runtimeStatus: CreatorOperationRuntimeStatus
    runtimeFreshnessAttempts: int = Field(ge=0, le=3)
    runtimeFreshnessWaitMs: int = Field(ge=0)
    presentInstancesVerified: list[BoundedPluginInstanceId] = Field(
        default_factory=list, max_length=MAX_TOTAL_PLUGIN_INSTANCES
    )
    absentInstancesVerified: list[BoundedPluginInstanceId] = Field(
        default_factory=list, max_length=MAX_TOTAL_PLUGIN_INSTANCES
    )
    placementVerified: bool | None = None
    geometryVerified: bool | None = None
    compositionVerified: bool | None = None


class CreatorOperationMetrics(BaseModel):
    """Minimal metrics kept local to the Productized operation path."""

    model_config = ConfigDict(extra="forbid")

    operationPlaybookUsed: bool = True
    operationDurationMs: int = Field(ge=0)
    executionModelCalls: int = Field(ge=0)
    mutationAttempts: int = Field(ge=0, le=2)
    snapshotRefreshes: int = Field(ge=0, le=1)
    verificationRuntimeFreshnessAttempts: int = Field(ge=0, le=3)


class CreatorOperationExecutionResult(BaseModel):
    """Structured terminal result for a Productized Operation Playbook."""

    model_config = ConfigDict(extra="forbid")

    operation: ProductizedOperationKind
    status: CreatorOperationExecutionStatus
    pluginId: BoundedPluginId | None = None
    instanceId: BoundedPluginInstanceId | None = None
    mutationChanged: bool = False
    mutationRevision: int | None = Field(default=None, ge=0)
    verification: CreatorOperationVerificationResult | None = None
    metrics: CreatorOperationMetrics
    errorCode: str | None = None
    message: str | None = None
    details: Any = None


@dataclass(frozen=True, slots=True)
class CreatorDomainSnapshot:
    """Authoritative composition snapshot plus its compact resolver projection."""

    raw: dict[str, Any]
    app_ui_model_hash: str
    capability_catalog_revision: str
    observation_coverage: tuple[str, ...]
    plugin_index: PluginCapabilityIndex

    @property
    def resolver_context(self) -> dict[str, Any]:
        """Return only the bounded capability index intended for the resolver model."""

        return self.plugin_index.model_dump(mode="json", exclude_none=True)

    def to_dict(self) -> dict[str, Any]:
        """Return a defensive copy of the full Host snapshot."""

        return copy.deepcopy(self.raw)
