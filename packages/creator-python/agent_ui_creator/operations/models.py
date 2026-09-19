from __future__ import annotations

import copy
import hashlib
from dataclasses import dataclass, field
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
MAX_CREATOR_ACTION_CANDIDATES = 256
MAX_CREATOR_AUTHORING_TARGETS = 64
MAX_AUTHORING_TARGET_INTENTS = 16
MAX_AUTHORING_TARGET_ID_CHARS = 100
MAX_AUTHORING_TARGET_NAME_CHARS = 200
MAX_AUTHORING_TARGET_DESCRIPTION_CHARS = 400
MAX_AUTHORING_TARGET_PATH_CHARS = 400
MAX_CREATOR_INTENT_CANDIDATES = MAX_CREATOR_ACTION_CANDIDATES + MAX_CREATOR_AUTHORING_TARGETS
MAX_ACTION_ID_CHARS = 64
MAX_ACTION_LABEL_CHARS = 200
MAX_ACTION_DESCRIPTION_CHARS = 400
MAX_CLARIFICATION_QUESTION_CHARS = 300


def unified_creator_intent_catalog_revision(
    action_catalog_revision: str,
    authoring_target_catalog_revision: str,
) -> str:
    """Bind Composition Actions and authoring targets to one selector revision."""

    source = f"{action_catalog_revision}:{authoring_target_catalog_revision}"
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


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
InvalidActionSelectionReason: TypeAlias = Literal[
    "output_budget_exhausted",
    "protocol_parse_failed",
    "unknown_choice_key",
    "structured_parse_failed",
    "schema_validation_failed",
    "unknown_action_id",
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
BoundedActionId: TypeAlias = Annotated[
    str, Field(min_length=1, max_length=MAX_ACTION_ID_CHARS)
]
BoundedActionLabel: TypeAlias = Annotated[
    str, Field(min_length=1, max_length=MAX_ACTION_LABEL_CHARS)
]
BoundedActionDescription: TypeAlias = Annotated[
    str, Field(min_length=1, max_length=MAX_ACTION_DESCRIPTION_CHARS)
]
BoundedClarificationQuestion: TypeAlias = Annotated[
    str, Field(min_length=1, max_length=MAX_CLARIFICATION_QUESTION_CHARS)
]
BoundedAuthoringTargetId: TypeAlias = Annotated[
    str, Field(min_length=1, max_length=MAX_AUTHORING_TARGET_ID_CHARS)
]
BoundedAuthoringTargetName: TypeAlias = Annotated[
    str, Field(min_length=1, max_length=MAX_AUTHORING_TARGET_NAME_CHARS)
]
BoundedAuthoringTargetDescription: TypeAlias = Annotated[
    str, Field(min_length=1, max_length=MAX_AUTHORING_TARGET_DESCRIPTION_CHARS)
]
BoundedAuthoringTargetPath: TypeAlias = Annotated[
    str, Field(min_length=1, max_length=MAX_AUTHORING_TARGET_PATH_CHARS)
]
BoundedIntentCandidateId: TypeAlias = Annotated[
    str,
    Field(
        min_length=1,
        max_length=max(MAX_ACTION_ID_CHARS, MAX_AUTHORING_TARGET_ID_CHARS),
    ),
]

CreatorAuthoringTargetKind: TypeAlias = Literal[
    "application_config",
    "plugin_source",
]


class PluginInstanceSummary(BaseModel):
    """The persistent authoring identity of one current Plugin instance."""

    model_config = ConfigDict(extra="forbid")

    instanceId: BoundedPluginInstanceId
    enabled: bool


class PluginRelativeDefaultPlacement(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["relative"]
    relation: PluginPlacementRelation
    anchorPluginId: BoundedPluginAnchorId


class PluginSlotDefaultPlacement(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["plugin_slot"]
    parentPluginId: BoundedPluginAnchorId
    slot: Annotated[str, Field(min_length=1, max_length=MAX_CHILD_SLOT_NAME_CHARS)]


PluginDefaultPlacement: TypeAlias = Annotated[
    PluginRelativeDefaultPlacement | PluginSlotDefaultPlacement,
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
    """Compact semantic capability metadata for one UI Plugin."""

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
    """Bounded semantic capability index derived from the Host snapshot."""

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


class AddDefaultActionEffect(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["add_default"]


class RemoveActionEffect(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["remove"]


class RelativeActionEffect(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["relative"]
    anchorPluginId: BoundedPluginId
    anchorPluginName: BoundedPluginName
    anchorInstanceId: BoundedPluginInstanceId
    relation: Literal["before", "after"]


class RowEdgeActionEffect(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["row_edge"]
    edge: Literal["left", "right"]


class WorkspaceRegionActionEffect(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["workspace_region"]
    region: Literal["left", "center", "right"]


class PluginSlotActionEffect(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["plugin_slot"]
    parentPluginId: BoundedPluginId
    parentPluginName: BoundedPluginName
    parentInstanceId: BoundedPluginInstanceId
    slot: BoundedPluginChildSlotName


CreatorActionEffect: TypeAlias = Annotated[
    AddDefaultActionEffect
    | RemoveActionEffect
    | RelativeActionEffect
    | RowEdgeActionEffect
    | WorkspaceRegionActionEffect
    | PluginSlotActionEffect,
    Field(discriminator="type"),
]


class CreatorActionTarget(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pluginId: BoundedPluginId
    pluginName: BoundedPluginName
    instanceId: BoundedPluginInstanceId | None = None


CreatorActionKind: TypeAlias = Literal[
    "add_existing_plugin",
    "remove_plugin",
    "move_plugin",
]
CreatorActionStatus: TypeAlias = Literal["ready", "already_satisfied"]


class CreatorActionCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    actionId: BoundedActionId
    kind: CreatorActionKind
    status: CreatorActionStatus
    label: BoundedActionLabel
    description: BoundedActionDescription
    target: CreatorActionTarget
    effect: CreatorActionEffect

    @model_validator(mode="after")
    def validate_wire_invariants(self) -> "CreatorActionCandidate":
        effect_type = self.effect.type
        if self.kind == "add_existing_plugin" and effect_type not in {
            "add_default", "workspace_region"
        }:
            raise ValueError("add_existing_plugin must use add_default or workspace_region.")
        if self.kind == "remove_plugin":
            if effect_type != "remove":
                raise ValueError("remove_plugin must use a remove effect.")
            if self.status == "ready" and self.target.instanceId is None:
                raise ValueError(
                    "A ready remove_plugin action requires a target instance."
                )
        if self.kind == "move_plugin":
            if effect_type not in {
                "relative",
                "row_edge",
                "workspace_region",
                "plugin_slot",
            }:
                raise ValueError(
                    "move_plugin must use a relative, row_edge, workspace_region, "
                    "or plugin_slot effect."
                )
            if self.target.instanceId is None:
                raise ValueError("A move_plugin action requires a target instance.")
        return self


class CreatorAuthoringTargetCandidate(BaseModel):
    """Model-facing ownership metadata without source paths."""

    model_config = ConfigDict(extra="forbid")

    targetId: BoundedAuthoringTargetId
    kind: CreatorAuthoringTargetKind
    name: BoundedAuthoringTargetName
    description: BoundedAuthoringTargetDescription
    intents: list[BoundedPluginIntent] = Field(
        default_factory=list, max_length=MAX_AUTHORING_TARGET_INTENTS
    )
    relatedPluginIds: list[BoundedPluginId] = Field(default_factory=list, max_length=MAX_PLUGIN_CAPABILITIES)

    @model_validator(mode="after")
    def validate_intents(self) -> "CreatorAuthoringTargetCandidate":
        if not self.intents:
            raise ValueError("An authoring target must declare at least one intent.")
        if len(set(self.intents)) != len(self.intents):
            raise ValueError("An authoring target contains duplicate intents.")
        if len(set(self.relatedPluginIds)) != len(self.relatedPluginIds):
            raise ValueError("An authoring target contains duplicate related Plugin ids.")
        return self


class CreatorAuthoringTargetBinding(BaseModel):
    """Host-only source binding for a selected authoring target."""

    model_config = ConfigDict(extra="forbid")

    targetId: BoundedAuthoringTargetId
    kind: CreatorAuthoringTargetKind
    ownerPath: BoundedAuthoringTargetPath | None = None
    ownerRoot: BoundedAuthoringTargetPath | None = None
    definitionPath: BoundedAuthoringTargetPath | None = None
    manifestPath: BoundedAuthoringTargetPath | None = None
    pluginId: BoundedPluginId | None = None
    relatedPluginIds: list[BoundedPluginId] = Field(default_factory=list, max_length=MAX_PLUGIN_CAPABILITIES)

    @model_validator(mode="after")
    def validate_binding(self) -> "CreatorAuthoringTargetBinding":
        if self.kind == "application_config" and self.ownerPath is None:
            raise ValueError("An application_config target requires ownerPath.")
        if self.kind == "plugin_source" and (
            self.ownerRoot is None or self.definitionPath is None or self.pluginId is None
        ):
            raise ValueError(
                "A plugin_source target requires ownerRoot, definitionPath, and pluginId."
            )
        return self


class CreatorAuthoringTargetCatalogSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    revision: Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")] = "0" * 64
    candidates: list[CreatorAuthoringTargetCandidate] = Field(
        default_factory=list, max_length=MAX_CREATOR_AUTHORING_TARGETS
    )
    bindings: list[CreatorAuthoringTargetBinding] = Field(
        default_factory=list, max_length=MAX_CREATOR_AUTHORING_TARGETS
    )

    @model_validator(mode="after")
    def validate_unique_targets(self) -> "CreatorAuthoringTargetCatalogSnapshot":
        candidate_ids = [target.targetId for target in self.candidates]
        binding_ids = [binding.targetId for binding in self.bindings]
        if len(set(candidate_ids)) != len(candidate_ids):
            raise ValueError("Authoring Target Catalog contains duplicate target ids.")
        if len(set(binding_ids)) != len(binding_ids):
            raise ValueError("Authoring Target Catalog contains duplicate binding ids.")
        if set(candidate_ids) != set(binding_ids):
            raise ValueError("Authoring Target Catalog candidates and bindings must match.")
        return self


class CreatorIntentCandidate(BaseModel):
    """The model-facing union of a Composition Action and authoring target."""

    model_config = ConfigDict(extra="forbid")

    type: Literal["composition_action", "application_config", "plugin_source"]
    candidateId: BoundedIntentCandidateId
    label: BoundedActionLabel
    description: BoundedActionDescription
    action: CreatorActionCandidate | None = None
    target: CreatorAuthoringTargetCandidate | None = None

    @model_validator(mode="after")
    def validate_candidate(self) -> "CreatorIntentCandidate":
        if self.type == "composition_action":
            if self.action is None or self.target is not None:
                raise ValueError("A composition_action candidate requires only action.")
            if self.candidateId != self.action.actionId:
                raise ValueError("Composition intent candidateId must match actionId.")
        else:
            if self.target is None or self.action is not None:
                raise ValueError("An authoring candidate requires only target.")
            if self.candidateId != self.target.targetId:
                raise ValueError("Authoring intent candidateId must match targetId.")
            if self.type != self.target.kind:
                raise ValueError("Authoring intent type must match target kind.")
        return self


class CreatorIntentCatalogSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    revision: Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
    candidates: list[CreatorIntentCandidate] = Field(
        default_factory=list, max_length=MAX_CREATOR_INTENT_CANDIDATES
    )

    @model_validator(mode="after")
    def validate_unique_candidate_ids(self) -> "CreatorIntentCatalogSnapshot":
        candidate_ids = [candidate.candidateId for candidate in self.candidates]
        if len(set(candidate_ids)) != len(candidate_ids):
            raise ValueError("Creator Intent Catalog contains duplicate candidate ids.")
        return self


class CreatorAuthoringHandoff(BaseModel):
    """Resolved Host ownership passed to a scoped General Agent."""

    model_config = ConfigDict(extra="forbid")

    targetId: BoundedAuthoringTargetId
    kind: CreatorAuthoringTargetKind
    name: BoundedAuthoringTargetName
    description: BoundedAuthoringTargetDescription
    ownerPath: BoundedAuthoringTargetPath | None = None
    ownerRoot: BoundedAuthoringTargetPath | None = None
    definitionPath: BoundedAuthoringTargetPath | None = None
    relatedPluginIds: list[BoundedPluginId] = Field(default_factory=list, max_length=MAX_PLUGIN_CAPABILITIES)
    pluginId: BoundedPluginId | None = None

    @model_validator(mode="after")
    def validate_owner(self) -> "CreatorAuthoringHandoff":
        if self.kind == "application_config" and self.ownerPath is None:
            raise ValueError("Application Config handoff requires ownerPath.")
        if self.kind == "plugin_source" and (
            self.ownerRoot is None or self.definitionPath is None or self.pluginId is None
        ):
            raise ValueError("Plugin Source handoff requires ownerRoot, definitionPath, and pluginId.")
        return self


class CreatorActionCatalogSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    revision: Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
    candidates: list[CreatorActionCandidate] = Field(
        default_factory=list,
        max_length=MAX_CREATOR_ACTION_CANDIDATES,
    )

    @model_validator(mode="after")
    def validate_unique_action_ids(self) -> "CreatorActionCatalogSnapshot":
        action_ids = [candidate.actionId for candidate in self.candidates]
        if len(set(action_ids)) != len(action_ids):
            raise ValueError("Creator Action Catalog contains duplicate action ids.")
        return self


class CreatorActionSemanticPlugin(BaseModel):
    """Only the semantic identity needed to ground a supplied Action target."""

    model_config = ConfigDict(extra="forbid")

    pluginId: BoundedPluginId
    name: BoundedPluginName
    description: BoundedPluginDescription
    capabilities: list[BoundedPluginCapability] = Field(
        default_factory=list,
        max_length=MAX_PLUGIN_CAPABILITY_TAGS,
    )
    intents: list[BoundedPluginIntent] = Field(
        default_factory=list,
        max_length=MAX_PLUGIN_INTENTS,
    )
    visualRole: BoundedPluginVisualRole | None = None


class CreatorActionSelectorContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    catalogRevision: Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
    actions: list[CreatorActionCandidate] = Field(
        default_factory=list,
        max_length=MAX_CREATOR_ACTION_CANDIDATES,
    )
    pluginSemantics: list[CreatorActionSemanticPlugin] = Field(
        default_factory=list,
        max_length=MAX_PLUGIN_CAPABILITIES,
    )
    intentCatalog: CreatorIntentCatalogSnapshot | None = None

    @model_validator(mode="after")
    def validate_unique_action_ids(self) -> "CreatorActionSelectorContext":
        action_ids = [candidate.actionId for candidate in self.actions]
        if len(set(action_ids)) != len(action_ids):
            raise ValueError("Action Selector context contains duplicate action ids.")
        return self


# Public names for the unified model-facing vocabulary. The legacy names remain
# valid for composition-only callers and persisted fixtures.
CreatorIntentSelectorContext = CreatorActionSelectorContext


CreatorActionDecision: TypeAlias = Literal[
    "select_action",
    "select_intent",
    "needs_clarification",
    "general_change",
    "unsupported_product_action",
]


class CreatorActionSelection(BaseModel):
    """Host-normalized result of CreatorActionSelector."""

    model_config = ConfigDict(extra="forbid")

    decision: CreatorActionDecision
    actionId: BoundedActionId | None = None
    targetId: BoundedAuthoringTargetId | None = None
    clarificationQuestion: BoundedClarificationQuestion | None = None

    @model_validator(mode="after")
    def validate_decision_fields(self) -> "CreatorActionSelection":
        if self.decision == "select_action":
            if self.actionId is None:
                raise ValueError("actionId is required for select_action.")
            if self.targetId is not None or self.clarificationQuestion is not None:
                raise ValueError(
                    "targetId and clarificationQuestion must be null for select_action."
                )
        elif self.decision == "select_intent":
            if self.targetId is None:
                raise ValueError("targetId is required for select_intent.")
            if self.actionId is not None or self.clarificationQuestion is not None:
                raise ValueError(
                    "actionId and clarificationQuestion must be null for select_intent."
                )
        elif self.decision == "needs_clarification":
            if self.actionId is not None or self.targetId is not None:
                raise ValueError(
                    "actionId and targetId must be null for needs_clarification."
                )
            if (
                self.clarificationQuestion is None
                or not self.clarificationQuestion.strip()
            ):
                raise ValueError(
                    "clarificationQuestion is required for needs_clarification."
                )
        else:
            if self.actionId is not None or self.targetId is not None:
                raise ValueError(f"actionId and targetId must be null for {self.decision}.")
            if self.clarificationQuestion is not None:
                raise ValueError(
                    f"clarificationQuestion must be null for {self.decision}."
                )
        return self


CreatorIntentSelection = CreatorActionSelection


@dataclass(slots=True)
class CreatorActionSelectorMetrics:
    modelCalls: int = 0
    repairCalls: int = 0
    invalidResponses: int = 0
    durationMs: int = 0
    candidateCount: int = 0
    contextCharacters: int = 0
    repairReasonCode: InvalidActionSelectionReason | None = None
    repairReason: str | None = None
    finishReason: str | None = None
    promptTokens: int | None = None
    completionTokens: int | None = None
    totalTokens: int | None = None
    reasoningTokens: int | None = None
    resolvedModel: str | None = None

    def to_dict(self) -> dict[str, object]:
        result: dict[str, object] = {
            "modelCalls": self.modelCalls,
            "repairCalls": self.repairCalls,
            "invalidResponses": self.invalidResponses,
            "durationMs": self.durationMs,
            "candidateCount": self.candidateCount,
            "contextCharacters": self.contextCharacters,
        }
        if self.repairReasonCode is not None:
            result["repairReasonCode"] = self.repairReasonCode
        if self.repairReason is not None:
            result["repairReason"] = self.repairReason
        return result


class CreatorVisualObservationEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    observationId: str
    currentHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    format: Literal["webp"]
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")


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
    workspaceFillVerified: bool | None = None
    compositionVerified: bool | None = None
    visualObservationStatus: Literal["observed", "stale", "unavailable", "not-requested"] = "not-requested"
    visualObservation: CreatorVisualObservationEvidence | None = None
    visualObservationCaptureDurationMs: int | None = Field(default=None, ge=0)
    visualObservationUploadDurationMs: int | None = Field(default=None, ge=0)
    visualObservationBytes: int | None = Field(default=None, ge=0)


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
    """Authoritative composition snapshot plus bounded model projections."""

    raw: dict[str, Any]
    app_ui_model_hash: str
    capability_catalog_revision: str
    observation_coverage: tuple[str, ...]
    plugin_index: PluginCapabilityIndex
    action_catalog: CreatorActionCatalogSnapshot
    authoring_target_catalog: CreatorAuthoringTargetCatalogSnapshot = field(
        default_factory=CreatorAuthoringTargetCatalogSnapshot
    )

    @property
    def action_selector_context(self) -> dict[str, Any]:
        """Return only current Actions and semantic metadata needed for selection."""

        plugins_by_id = {
            plugin.pluginId: plugin for plugin in self.plugin_index.plugins
        }
        referenced_plugin_ids: list[str] = []
        referenced_plugin_id_set: set[str] = set()

        def add_reference(plugin_id: str) -> None:
            if plugin_id in referenced_plugin_id_set:
                return
            referenced_plugin_id_set.add(plugin_id)
            referenced_plugin_ids.append(plugin_id)

        for candidate in self.action_catalog.candidates:
            add_reference(candidate.target.pluginId)
            effect = candidate.effect
            if isinstance(effect, RelativeActionEffect):
                add_reference(effect.anchorPluginId)
            elif isinstance(effect, PluginSlotActionEffect):
                add_reference(effect.parentPluginId)

        plugin_semantics = [
            CreatorActionSemanticPlugin(
                pluginId=plugin.pluginId,
                name=plugin.name,
                description=plugin.description,
                capabilities=plugin.capabilities,
                intents=plugin.intents,
                visualRole=plugin.visualRole,
            )
            for plugin_id in referenced_plugin_ids
            if (plugin := plugins_by_id.get(plugin_id)) is not None
        ]
        intent_catalog = None
        if self.authoring_target_catalog.candidates:
            intent_candidates = [
                CreatorIntentCandidate(
                    type="composition_action",
                    candidateId=action.actionId,
                    label=action.label,
                    description=action.description,
                    action=action,
                )
                for action in self.action_catalog.candidates
            ]
            intent_candidates.extend(
                CreatorIntentCandidate(
                    type=target.kind,
                    candidateId=target.targetId,
                    label=target.name,
                    description=target.description,
                    target=target,
                )
                for target in self.authoring_target_catalog.candidates
            )
            intent_catalog = CreatorIntentCatalogSnapshot(
                revision=unified_creator_intent_catalog_revision(
                    self.action_catalog.revision,
                    self.authoring_target_catalog.revision,
                ),
                candidates=intent_candidates,
            )
        return CreatorActionSelectorContext(
            catalogRevision=self.action_catalog.revision,
            actions=self.action_catalog.candidates,
            pluginSemantics=plugin_semantics,
            intentCatalog=intent_catalog,
        ).model_dump(mode="json", exclude_none=True)

    def authoring_handoff(self, target_id: str) -> CreatorAuthoringHandoff:
        target = next(
            (item for item in self.authoring_target_catalog.candidates if item.targetId == target_id),
            None,
        )
        binding = next(
            (item for item in self.authoring_target_catalog.bindings if item.targetId == target_id),
            None,
        )
        if target is None or binding is None:
            raise KeyError(f"Unknown authoring target {target_id!r}.")
        return CreatorAuthoringHandoff(
            targetId=target.targetId,
            kind=target.kind,
            name=target.name,
            description=target.description,
            ownerPath=binding.ownerPath,
            ownerRoot=binding.ownerRoot,
            definitionPath=binding.definitionPath,
            relatedPluginIds=target.relatedPluginIds,
            pluginId=binding.pluginId or (
                target.relatedPluginIds[0] if target.kind == "plugin_source" and target.relatedPluginIds else None
            ),
        )

    def to_dict(self) -> dict[str, Any]:
        """Return a defensive copy of the full Host snapshot."""

        return copy.deepcopy(self.raw)
