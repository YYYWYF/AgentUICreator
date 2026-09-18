from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Any, Literal, TypeAlias

from pydantic import BaseModel, ConfigDict, Field, model_validator


MAX_PLUGIN_CAPABILITIES = 64
MAX_PLUGIN_INTENTS = 16
MAX_PLUGIN_INSTANCES = 32
MAX_TOTAL_PLUGIN_INSTANCES = 256


CreatorOperationKind: TypeAlias = Literal[
    "add_existing_plugin",
    "remove_plugin",
    "modify_plugin_logic",
    "general_change",
    "needs_clarification",
]

PluginPlacementRelation: TypeAlias = Literal["before", "after", "above", "below"]
AuthoringSize: TypeAlias = int | float | str


class PluginInstanceSummary(BaseModel):
    """The persistent authoring identity of one current Plugin instance."""

    model_config = ConfigDict(extra="forbid")

    instanceId: str = Field(min_length=1)
    enabled: bool


class PluginDefaultPlacement(BaseModel):
    model_config = ConfigDict(extra="forbid")

    relation: PluginPlacementRelation
    anchorPluginId: str = Field(min_length=1)


class PluginRecommendedSize(BaseModel):
    model_config = ConfigDict(extra="forbid")

    width: AuthoringSize | None = None
    height: AuthoringSize | None = None


class RequiredServiceSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: str = Field(min_length=1)


class PluginCapability(BaseModel):
    """Compact, resolver-facing capability metadata for one UI Plugin."""

    model_config = ConfigDict(extra="forbid")

    pluginId: str = Field(min_length=1)
    name: str = Field(min_length=1)
    description: str = Field(min_length=1)
    intents: list[str] = Field(default_factory=list, max_length=MAX_PLUGIN_INTENTS)
    visualRole: str | None = None
    selected: bool
    instances: list[PluginInstanceSummary] = Field(
        default_factory=list, max_length=MAX_PLUGIN_INSTANCES
    )
    defaultPlacement: PluginDefaultPlacement | None = None
    recommendedSize: PluginRecommendedSize | None = None
    requiredServices: RequiredServiceSummary | None = None


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
        return self


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
