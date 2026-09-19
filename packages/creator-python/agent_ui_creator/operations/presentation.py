from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, TypeAlias

from .models import (
    CreatorActionCandidate,
    CreatorActionSelection,
    CreatorOperationKind,
    CreatorOperationResolution,
    PluginSlotActionEffect,
    PluginSlotMovePlacement,
    PluginCapabilityIndex,
    RelativeMovePlacement,
    RelativeActionEffect,
    RowEdgeActionEffect,
    WorkspaceRegionActionEffect,
)


CreatorIntentRoute: TypeAlias = Literal[
    "productized",
    "general-agent",
    "clarification",
    "unsupported",
]


@dataclass(frozen=True, slots=True)
class CreatorIntentPresentation:
    """Deterministic user/debug projection of one Creator routing decision."""

    label: str
    kind: str
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
    decision: str | None = None
    action_id: str | None = None
    action_kind: str | None = None
    action_status: str | None = None
    effect_type: str | None = None
    region: str | None = None

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
        value = {
            "displayIntent": self.label,
            "intent": self.kind,
            "targetPluginIds": list(self.target_plugin_ids),
            "targetInstanceIds": list(self.target_instance_ids),
            "route": self.route,
            **placement,
        }
        for key, item in {
            "decision": self.decision,
            "actionId": self.action_id,
            "actionKind": self.action_kind,
            "actionStatus": self.action_status,
            "effectType": self.effect_type,
            "region": self.region,
        }.items():
            if item is not None:
                value[key] = item
        return value


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


def _label_for_action_selection(
    selection: CreatorActionSelection,
    action: CreatorActionCandidate | None,
) -> str:
    if selection.decision == "needs_clarification":
        return "需要确认修改目标"
    if selection.decision == "unsupported_product_action":
        return "当前没有可安全执行的对应操作"
    if selection.decision == "general_change":
        return "执行需要进一步实现的修改"
    if action is None:
        return "当前没有可安全执行的对应操作"

    target = action.target.pluginName
    if action.kind == "add_existing_plugin":
        return f"添加 {target}"
    if action.kind == "remove_plugin":
        return f"移除 {target}"

    effect = action.effect
    if isinstance(effect, WorkspaceRegionActionEffect):
        region = {
            "left": "左侧区域",
            "center": "中间区域",
            "right": "右侧区域",
        }[effect.region]
        return f"将 {target} 移到{region}"
    if isinstance(effect, RowEdgeActionEffect):
        edge = "左侧区域" if effect.edge == "left" else "右侧区域"
        return f"将 {target} 移到{edge}"
    if isinstance(effect, RelativeActionEffect):
        side = "左侧" if effect.relation == "before" else "右侧"
        return f"将 {target} 移到 {effect.anchorPluginName} {side}"
    if isinstance(effect, PluginSlotActionEffect):
        return f"将 {target} 移入 {effect.parentPluginName} 的 {effect.slot} 插槽"
    return f"移动 {target}"


def present_creator_action_selection(
    selection: CreatorActionSelection,
    action: CreatorActionCandidate | None = None,
    *,
    route: CreatorIntentRoute | None = None,
) -> CreatorIntentPresentation:
    """Project the exact Action Selector decision without Host bindings."""

    if action is not None and not isinstance(action, CreatorActionCandidate):
        raise TypeError("action must be a CreatorActionCandidate or None.")

    selected = selection.decision == "select_action" and action is not None
    effective_route = route or {
        "select_action": "productized",
        "needs_clarification": "clarification",
        "general_change": "general-agent",
        "unsupported_product_action": "unsupported",
    }[selection.decision]
    target_plugin_ids = [action.target.pluginId] if selected else []
    target_instance_ids = (
        [action.target.instanceId]
        if selected and action.target.instanceId is not None
        else []
    )
    placement_fields: dict[str, str | None] = {}
    effect_type = None
    region = None
    if selected:
        effect = action.effect
        effect_type = effect.type
        if isinstance(effect, WorkspaceRegionActionEffect):
            region = effect.region
        elif isinstance(effect, RelativeActionEffect):
            placement_fields = {
                "placement_type": "relative",
                "anchor_plugin_id": effect.anchorPluginId,
                "anchor_instance_id": effect.anchorInstanceId,
                "relation": effect.relation,
            }
        elif isinstance(effect, PluginSlotActionEffect):
            placement_fields = {
                "placement_type": "plugin_slot",
                "parent_plugin_id": effect.parentPluginId,
                "parent_instance_id": effect.parentInstanceId,
                "slot": effect.slot,
            }

    return CreatorIntentPresentation(
        label=_label_for_action_selection(selection, action),
        kind=action.kind if selected else selection.decision,
        target_plugin_ids=tuple(target_plugin_ids),
        target_instance_ids=tuple(target_instance_ids),
        route=effective_route,
        decision=selection.decision,
        action_id=action.actionId if selected else None,
        action_kind=action.kind if selected else None,
        action_status=action.status if selected else None,
        effect_type=effect_type,
        region=region,
        **placement_fields,
    )
