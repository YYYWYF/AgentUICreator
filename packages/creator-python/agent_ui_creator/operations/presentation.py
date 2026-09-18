from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, TypeAlias

from .models import (
    CreatorOperationKind,
    CreatorOperationResolution,
    PluginSlotMovePlacement,
    PluginCapabilityIndex,
    RelativeMovePlacement,
)


CreatorIntentRoute: TypeAlias = Literal[
    "productized",
    "general-agent",
    "clarification",
]


@dataclass(frozen=True, slots=True)
class CreatorIntentPresentation:
    """Deterministic user/debug projection of one Resolver decision."""

    label: str
    kind: CreatorOperationKind
    target_plugin_ids: tuple[str, ...]
    target_instance_ids: tuple[str, ...]
    route: CreatorIntentRoute
    placement_type: str | None = None
    anchor_plugin_id: str | None = None
    anchor_instance_id: str | None = None
    relation: str | None = None
    parent_plugin_id: str | None = None
    parent_instance_id: str | None = None
    slot: str | None = None

    def to_dict(self) -> dict[str, object]:
        """Return the bounded wire shape consumed by Creator observability."""

        placement = {
            key: value
            for key, value in {
                "placementType": self.placement_type,
                "anchorPluginId": self.anchor_plugin_id,
                "anchorInstanceId": self.anchor_instance_id,
                "relation": self.relation,
                "parentPluginId": self.parent_plugin_id,
                "parentInstanceId": self.parent_instance_id,
                "slot": self.slot,
            }.items()
            if value is not None
        }
        return {
            "displayIntent": self.label,
            "intent": self.kind,
            "targetPluginIds": list(self.target_plugin_ids),
            "targetInstanceIds": list(self.target_instance_ids),
            "route": self.route,
            **placement,
        }


def route_for_operation(kind: CreatorOperationKind) -> CreatorIntentRoute:
    if kind in {"add_existing_plugin", "remove_plugin", "move_plugin"}:
        return "productized"
    if kind == "needs_clarification":
        return "clarification"
    return "general-agent"


def _target_plugin_name(
    resolution: CreatorOperationResolution,
    plugin_index: PluginCapabilityIndex,
) -> str | None:
    target_plugin_id = next(iter(resolution.targetPluginIds), None)
    if target_plugin_id is None:
        return None
    for plugin in plugin_index.plugins:
        if plugin.pluginId == target_plugin_id:
            return plugin.name
    return None


def _plugin_name(plugin_id: str, plugin_index: PluginCapabilityIndex) -> str | None:
    for plugin in plugin_index.plugins:
        if plugin.pluginId == plugin_id:
            return plugin.name
    return None


def _label_for_resolution(
    resolution: CreatorOperationResolution,
    plugin_index: PluginCapabilityIndex,
) -> str:
    plugin_name = _target_plugin_name(resolution, plugin_index)
    target = plugin_name or "目标 Plugin"
    if resolution.kind == "add_existing_plugin":
        return f"添加 {target}"
    if resolution.kind == "remove_plugin":
        return f"移除 {target}"
    if resolution.kind == "move_plugin":
        placement = resolution.placement
        if isinstance(placement, RelativeMovePlacement):
            anchor = _plugin_name(placement.anchorPluginId, plugin_index) or "目标 Plugin"
            side = "左侧" if placement.relation == "before" else "右侧"
            return f"将 {target} 移到 {anchor} {side}"
        if isinstance(placement, PluginSlotMovePlacement):
            parent = _plugin_name(placement.parentPluginId, plugin_index) or "目标 Plugin"
            return f"将 {target} 移入 {parent} 的 {placement.slot} 插槽"
        return f"移动 {target}"
    if resolution.kind == "modify_plugin_logic":
        return f"修改 {target} 的逻辑"
    if resolution.kind == "general_change":
        return "执行跨范围修改"
    return "需要确认修改目标"


def present_creator_intent(
    resolution: CreatorOperationResolution,
    plugin_index: PluginCapabilityIndex,
    *,
    route: CreatorIntentRoute | None = None,
) -> CreatorIntentPresentation:
    """Project a validated resolution without another model call or lookup table."""

    placement = resolution.placement
    placement_fields: dict[str, str | None] = {}
    if isinstance(placement, RelativeMovePlacement):
        placement_fields = {
            "placement_type": "relative",
            "anchor_plugin_id": placement.anchorPluginId,
            "anchor_instance_id": placement.anchorInstanceId,
            "relation": placement.relation,
        }
    elif isinstance(placement, PluginSlotMovePlacement):
        placement_fields = {
            "placement_type": "plugin_slot",
            "parent_plugin_id": placement.parentPluginId,
            "parent_instance_id": placement.parentInstanceId,
            "slot": placement.slot,
        }

    return CreatorIntentPresentation(
        label=_label_for_resolution(resolution, plugin_index),
        kind=resolution.kind,
        target_plugin_ids=tuple(resolution.targetPluginIds),
        target_instance_ids=tuple(resolution.targetInstanceIds),
        route=route or route_for_operation(resolution.kind),
        **placement_fields,
    )
