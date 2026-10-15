from __future__ import annotations

import json
import hashlib
import re
from collections.abc import Awaitable, Callable, Mapping, Sequence
from typing import Any

from langchain.agents.middleware import AgentMiddleware, ModelRequest, ModelResponse
from langchain_core.messages import ToolMessage

from ..resource_scope import project_logical_path
from ..files import resolve_creator_project_file
from ..minimal_agent.tool_policy import tool_name
from ..project_paths import agent_ui_source_path
from .authority import PluginDevelopmentAuthority, PluginDevelopmentError


_SKILL_PATH = "/skills/ui-plugin-development/SKILL.md"
_PLUGIN_LOCALE_PATHS = frozenset({
    "/agent-ui/i18n/locale-types.ts",
    "/agent-ui/i18n/locales/zh-CN.ts",
    "/agent-ui/i18n/locales/en-US.ts",
})
_WRITES = frozenset({
    "edit_file", "create_ui_plugin", "create_custom_plugin", "mutate_ui_plugin_source",
    "mutate_app_ui_model", "apply_agent_ui_source_item",
    "prepare_ui_service_contract_change", "create_ui_service_contract",
    "mutate_ui_service_contract",
})
_LITERAL_PLACEHOLDER = re.compile(
    r"\bplaceholder\s*=\s*(?:\{\s*)?([\"'])([^\"']+)\1(?:\s*\})?"
)


class PluginLiteralPresentationCopyError(PluginDevelopmentError):
    code = "PLUGIN_LITERAL_PRESENTATION_COPY"


class PluginCustomizedSourceDecisionRequired(PluginDevelopmentError):
    code = "PLUGIN_CUSTOMIZED_SOURCE_DECISION_REQUIRED"


class PluginDevelopmentPlacementRequired(PluginDevelopmentError):
    code = "PLUGIN_DEVELOPMENT_PLACEMENT_REQUIRED"


def _result_payload(result: Any) -> Mapping[str, Any] | None:
    value = getattr(result, "content", result)
    if not isinstance(value, str):
        return value if isinstance(value, Mapping) else None
    try:
        parsed = json.loads(value)
    except (ValueError, TypeError):
        return None
    return parsed if isinstance(parsed, Mapping) else None


def _inventory_complete(value: Mapping[str, Any]) -> bool:
    return value.get("pageComplete") is not False and value.get("nextCursor") is None


class PluginDevelopmentAdmissionMiddleware(AgentMiddleware):
    """Dynamic tool visibility and actual-call protection for Creator authoring.

    Source installation remains on its existing installer path. This middleware
    never treats an installed Source Item as an authored new Plugin identity.
    """

    def __init__(self, authority: PluginDevelopmentAuthority, *, official_reference_plugin_id: str | None = None) -> None:
        self.authority = authority
        self.official_reference_plugin_id = official_reference_plugin_id
        self._composition_snapshot_hash: str | None = None
        self._composition_pages: dict[int, str] = {}

    def _complete_composition(self, value: Mapping[str, Any]) -> Mapping[str, Any] | None:
        if "pageText" not in value:
            return value if _inventory_complete(value) else None
        snapshot_hash = value.get("snapshotHash")
        offset = value.get("pageOffset")
        page_text = value.get("pageText")
        total_chars = value.get("totalChars")
        if (not isinstance(snapshot_hash, str) or not isinstance(offset, int)
                or not isinstance(page_text, str) or not isinstance(total_chars, int)):
            return None
        if snapshot_hash != self._composition_snapshot_hash:
            self._composition_snapshot_hash = snapshot_hash
            self._composition_pages.clear()
        self._composition_pages[offset] = page_text
        if value.get("pageComplete") is not True or value.get("nextCursor") is not None:
            return None
        position = 0
        parts: list[str] = []
        for page_offset, part in sorted(self._composition_pages.items()):
            if page_offset != position:
                return None
            parts.append(part)
            position += len(part)
        if position != total_chars:
            return None
        try:
            payload = json.loads("".join(parts))
        except (TypeError, ValueError):
            return None
        self._composition_pages.clear()
        result = payload.get("result") if isinstance(payload, Mapping) and payload.get("ok") is True else None
        return result if isinstance(result, Mapping) else None

    def _visible_tools(self, tools: Sequence[Any]) -> list[Any]:
        if self.authority.needs_plugin_inventory and any(
            tool_name(candidate) == "list_ui_plugins" for candidate in tools
        ):
            return [candidate for candidate in tools if tool_name(candidate) == "list_ui_plugins"]
        return [tool for tool in tools if (
            tool_name(tool) != "create_ui_plugin" or self.authority.can_expose_create
        ) and (
            tool_name(tool) != "prepare_ui_plugin_development"
            or self.authority.can_expose_prepare
        )]

    def wrap_model_call(
        self, request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelResponse:
        return handler(request.override(tools=self._visible_tools(request.tools)))

    async def awrap_model_call(
        self, request: ModelRequest,
        handler: Callable[[ModelRequest], Awaitable[ModelResponse]],
    ) -> ModelResponse:
        return await handler(request.override(tools=self._visible_tools(request.tools)))

    def _new_plugin_identity(self, path: str) -> str | None:
        logical = project_logical_path(path, self.authority.project_root)
        parts = logical.strip("/").split("/")
        if len(parts) < 3 or parts[0] != "plugins":
            return None
        plugin_id = parts[1]
        physical = self.authority.project_root / agent_ui_source_path(
            self.authority.project_root, f"plugins/{plugin_id}"
        ).lstrip("/")
        return plugin_id if not physical.exists() else None

    def _selected_plugin_ids(self) -> set[str]:
        model_path = self.authority.project_root / agent_ui_source_path(
            self.authority.project_root, "app-ui/app-ui.json"
        ).lstrip("/")
        try:
            model = json.loads(model_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return set()
        selected: set[str] = set()

        def visit(value: Any) -> None:
            if isinstance(value, dict):
                plugin_id = value.get("pluginId")
                if isinstance(plugin_id, str):
                    selected.add(plugin_id)
                for child in value.values():
                    visit(child)
            elif isinstance(value, list):
                for child in value:
                    visit(child)

        visit(model)
        return selected

    def _selected_plugin_instances(self) -> dict[str, str]:
        model_path = self.authority.project_root / agent_ui_source_path(
            self.authority.project_root, "app-ui/app-ui.json"
        ).lstrip("/")
        try:
            model = json.loads(model_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}
        selected: dict[str, str] = {}

        def plugins(items: Any) -> None:
            for instance in items if isinstance(items, list) else []:
                if not isinstance(instance, dict):
                    continue
                plugin_id, instance_id = instance.get("pluginId"), instance.get("id")
                if isinstance(plugin_id, str) and isinstance(instance_id, str):
                    selected[instance_id] = plugin_id
                for children in instance.get("slots", {}).values():
                    plugins(children)

        def layout(node: Any) -> None:
            if not isinstance(node, dict):
                return
            if node.get("type") == "slot":
                plugins(node.get("plugins"))
            if node.get("type") == "sidebar":
                for edge in ("header", "content", "footer"):
                    layout(node.get(edge))
                for item in node.get("items", []):
                    if isinstance(item, dict):
                        layout(item.get("child"))
            for child in node.get("children", []):
                layout(child)
            layout(node.get("child"))

        plugins(model.get("applicationPlugins"))
        layout(model.get("root"))
        return selected

    def _relative_default_placement(self, plugin_id: str) -> dict[str, Any] | None:
        manifest_path = self.authority.project_root / agent_ui_source_path(
            self.authority.project_root, f"plugins/{plugin_id}/manifest.json"
        ).lstrip("/")
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None
        authoring = manifest.get("authoring") if isinstance(manifest, dict) else None
        placement = authoring.get("defaultPlacement") if isinstance(authoring, dict) else None
        return placement if isinstance(placement, dict) and placement.get("type") == "relative" else None

    def _platform_panel_track_pending(self) -> bool:
        record = self.authority.active
        contract = record.delivery_contract if record is not None else None
        if not isinstance(contract, dict) or contract.get("renderingCategory") != "panel":
            return False
        model_path = self.authority.project_root / agent_ui_source_path(
            self.authority.project_root, "app-ui/app-ui.json"
        ).lstrip("/")
        try:
            model = json.loads(model_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return False
        root = model.get("root") if isinstance(model, dict) else None
        if not isinstance(root, dict) or root.get("type") != "row":
            return False
        children, responsive = root.get("children"), root.get("responsive")
        return (
            isinstance(children, list) and isinstance(responsive, dict)
            and responsive.get("type") == "trailing-drawer"
            and responsive.get("drawerIndex") == len(children)
        )

    def _is_root_drawer_panel_insertion(
        self, operation: Mapping[str, Any], placement: Mapping[str, Any] | None
    ) -> bool:
        """A root Row's declared drawer child is a valid explicit side panel."""
        if operation.get("type") != "insert_layout_node" or operation.get("parentRef") != "l0":
            return False
        node = operation.get("node")
        if not isinstance(node, dict) or node.get("type") != "panel":
            return False
        child = node.get("child")
        if not isinstance(child, dict) or child.get("type") != "slot":
            return False
        model_path = self.authority.project_root / agent_ui_source_path(
            self.authority.project_root, "app-ui/app-ui.json"
        ).lstrip("/")
        try:
            model = json.loads(model_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return False
        root = model.get("root") if isinstance(model, dict) else None
        if not isinstance(root, dict) or root.get("type") != "row":
            return False
        children, responsive = root.get("children"), root.get("responsive")
        primary_index = responsive.get("primaryIndex") if isinstance(responsive, dict) else None
        if (not isinstance(children, list) or not isinstance(primary_index, int)
                or primary_index < 0 or primary_index >= len(children)):
            return False

        def contains_anchor(value: Any, anchor_plugin_id: str) -> bool:
            if isinstance(value, dict):
                return value.get("pluginId") == anchor_plugin_id or any(
                    contains_anchor(child, anchor_plugin_id) for child in value.values()
                )
            return isinstance(value, list) and any(
                contains_anchor(child, anchor_plugin_id) for child in value
            )

        return (
            (placement is None or (
                placement.get("relation") == "after"
                and isinstance(placement.get("anchorPluginId"), str)
                and contains_anchor(children[primary_index], placement["anchorPluginId"])
            ))
            and isinstance(responsive, dict) and responsive.get("type") == "trailing-drawer"
            and operation.get("index") == len(children) == responsive.get("drawerIndex")
        )

    def _require_bound_composition(self, operations: object, target_plugin_id: str) -> None:
        """A development grant admits only its Plugin selection, before Host mutation."""
        if not isinstance(operations, list) or not operations:
            raise PluginDevelopmentError("AppUIModel 操作缺少有效的开发目标。")
        selected = self._selected_plugin_instances()
        relative_default = self._relative_default_placement(target_plugin_id)
        panel_track_pending = self._platform_panel_track_pending()

        def require_default_placement() -> None:
            raise PluginDevelopmentPlacementRequired(
                "此 Plugin 声明了相对默认位置；请使用 insert_plugin_default "
                "按清单中的 anchor 和尺寸组合，不要插入现有会话 Slot 或其嵌套 Row。"
            )

        def require_panel_track() -> None:
            raise PluginDevelopmentPlacementRequired(
                "Platform 的新业务 Panel 必须占用根 Row 声明的 drawer track，"
                "不能插进现有导航或会话 Slot。若 manifest 声明了相对 defaultPlacement，"
                "请使用 insert_plugin_default；否则用 insert_layout_node 在根 Row "
                "的 drawerIndex 添加独立 Panel/Slot 和本 Plugin 实例。"
            )

        def plugin_nodes(value: Any) -> list[dict[str, Any]]:
            found: list[dict[str, Any]] = []
            if isinstance(value, dict):
                if "pluginId" in value:
                    found.append(value)
                for child in value.values():
                    found.extend(plugin_nodes(child))
            elif isinstance(value, list):
                for child in value:
                    found.extend(plugin_nodes(child))
            return found

        for operation in operations:
            if not isinstance(operation, dict):
                raise PluginDevelopmentError("AppUIModel 操作无效。")
            kind = operation.get("type")
            if kind in {"insert_plugin", "insert_plugin_default", "replace_plugin"}:
                nodes = plugin_nodes(operation.get("replacement") if kind == "replace_plugin" else operation.get("plugin"))
                if not nodes or any(node.get("pluginId") != target_plugin_id for node in nodes):
                    raise PluginDevelopmentError("插件组合超出了已批准的 Plugin 目标；已有 Plugin 需走独立的复用授权。")
                if kind == "insert_plugin" and panel_track_pending:
                    require_panel_track()
                if kind != "insert_plugin_default" and relative_default:
                    require_default_placement()
            elif kind == "insert_sidebar_item":
                plugin = operation.get("plugin")
                if plugin is not None:
                    nodes = plugin_nodes(plugin)
                    if not nodes or any(node.get("pluginId") != target_plugin_id for node in nodes):
                        raise PluginDevelopmentError("Sidebar 组合超出了已批准的 Plugin 目标。")
                else:
                    instance_id = operation.get("instanceId")
                    if not isinstance(instance_id, str) or selected.get(instance_id) != target_plugin_id:
                        raise PluginDevelopmentError("Sidebar 组合缺少已批准的 Plugin 目标。")
                if panel_track_pending:
                    require_panel_track()
                if relative_default:
                    require_default_placement()
            elif kind in {"insert_layout_node", "insert_layout_relative", "replace_layout_node"}:
                inserted_nodes = plugin_nodes(operation.get("node"))
                if (panel_track_pending and kind == "insert_layout_node"
                        and not inserted_nodes):
                    require_panel_track()
                for node in inserted_nodes:
                    plugin_id, instance_id = node.get("pluginId"), node.get("id")
                    if plugin_id != target_plugin_id and (
                        not isinstance(instance_id, str) or selected.get(instance_id) != plugin_id
                    ):
                        raise PluginDevelopmentError("布局操作不能借当前开发授权新增其他 Plugin。")
                    if (plugin_id == target_plugin_id and relative_default
                            and not self._is_root_drawer_panel_insertion(operation, relative_default)):
                        require_default_placement()
                    if (plugin_id == target_plugin_id and panel_track_pending
                            and not self._is_root_drawer_panel_insertion(operation, None)):
                        require_panel_track()
            elif kind in {"move_plugin", "move_plugin_to", "remove_plugin",
                          "remove_plugin_default", "set_plugin_enabled"}:
                instance_id = operation.get("instanceId")
                if not isinstance(instance_id, str) or selected.get(instance_id) != target_plugin_id:
                    raise PluginDevelopmentError("插件选择操作超出了已批准的 Plugin 目标。")
            elif kind == "execute_creator_action":
                raise PluginDevelopmentError("当前开发授权不能执行未展开目标的组合动作。")
            elif kind not in {"update_layout_node_props", "move_layout_node", "remove_layout_node"}:
                raise PluginDevelopmentError("当前开发授权不能执行未知的 AppUIModel 操作。")

    def _unselected_customized_source(self, plugin_id: str) -> bool:
        if plugin_id in self._selected_plugin_ids():
            return False
        lock_path = self.authority.project_root / ".agent-ui/source-lock.json"
        try:
            lock = json.loads(lock_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return False
        items = lock.get("items") if isinstance(lock, dict) else None
        item = items.get(f"plugin/{plugin_id}") if isinstance(items, dict) else None
        files = item.get("files") if isinstance(item, dict) else None
        if not isinstance(files, dict):
            return False
        prefix = f"plugins/{plugin_id}/"
        for relative, record in files.items():
            if not isinstance(relative, str) or not relative.startswith(prefix):
                continue
            if ".." in relative.split("/") or not isinstance(record, dict):
                continue
            recorded_hash = record.get("sha256")
            if not isinstance(recorded_hash, str):
                continue
            path = self.authority.project_root / agent_ui_source_path(
                self.authority.project_root, relative
            ).lstrip("/")
            try:
                current_hash = hashlib.sha256(path.read_bytes()).hexdigest()
            except OSError:
                return True
            if current_hash != recorded_hash:
                return True
        return False

    def customized_source_decision_required(self, plugin_id: str, logical: str | None = None) -> bool:
        message = self.authority.user_message.lower()
        explicit_path = logical is not None and logical.lstrip("/").lower() in message
        explicit_plugin = (plugin_id.lower() in message and any(
            term in message for term in ("修改", "定制", "修复", "edit", "customize", "modify")
        ))
        return (not explicit_path and not explicit_plugin
                and self._unselected_customized_source(plugin_id))

    def _require_customized_source_decision(self, plugin_id: str, logical: str | None = None) -> None:
        if self.customized_source_decision_required(plugin_id, logical):
            self.authority.blocked_customized_source_plugin_id = plugin_id
            raise PluginCustomizedSourceDecisionRequired(
                f"正式 Source Item plugin/{plugin_id} 已定制且尚未选用；当前请求未明确要求改写其源码。"
                "请先用 inspect_agent_ui_sources 确认冲突并说明继续路径，不要直接改写或声称功能已完成。"
            )

    def _admit(self, name: str, args: Mapping[str, Any]) -> None:
        active = self.authority.active
        if name in _WRITES and active is not None and active.status in {"pending", "adjust", "defer"}:
            raise PluginDevelopmentError("开发方案等待决定或已结束，不能写入目标工程。")
        if (name == "mutate_app_ui_model" and active is None
                and self.authority.intent in {"needs_decision", "explicit", "conditional"}
                and (self.authority.intent == "explicit"
                     or not self.authority.can_compose_existing(args.get("operations")))):
            raise PluginDevelopmentError("新开发方案未授权；当前只允许组合已检查的现有 Plugin。")
        if name in _WRITES and active is not None and active.status == "authorized":
            self.authority.require_skill()
        if name == "mutate_app_ui_model" and active is not None and active.status == "authorized":
            self._require_bound_composition(args.get("operations"), active.target_plugin_id)
        if name in {"create_ui_plugin", "create_custom_plugin"}:
            plugin_id = args.get("pluginId")
            if not isinstance(plugin_id, str):
                raise PluginDevelopmentError("创建目标 Plugin ID 无效。")
            official_derivation = (name == "create_custom_plugin"
                and self.official_reference_plugin_id == "assistant-ui-composer"
                and args.get("basedOn") == self.official_reference_plugin_id
                and (args.get("replaceInstanceId") or args.get("placement")))
            # A Host-resolved official customization target already authorizes
            # its project-owned implementation. Ordinary new capability work
            # continues to use the existing development authorization.
            if not official_derivation:
                self.authority.require_create(plugin_id)
        if name == "edit_file":
            path = args.get("file_path")
            if isinstance(path, str):
                logical = project_logical_path(path, self.authority.project_root)
                old_string = args.get("old_string")
                new_string = args.get("new_string")
                if (logical.startswith("/plugins/") and logical.endswith(".tsx")
                        and isinstance(old_string, str) and isinstance(new_string, str)):
                    added = set(_LITERAL_PLACEHOLDER.findall(new_string)) - set(
                        _LITERAL_PLACEHOLDER.findall(old_string)
                    )
                    if added:
                        raise PluginLiteralPresentationCopyError(
                            "Plugin placeholder 是用户可见文案；请先在 Agent UI locale 层添加翻译键，"
                            "再把本地化值传给组件的 placeholder prop。"
                        )
                if active is not None and active.status == "authorized":
                    if (not logical.startswith(f"/plugins/{active.target_plugin_id}/")
                            and logical not in _PLUGIN_LOCALE_PATHS):
                        raise PluginDevelopmentError("源码写入超出了已批准的 Plugin 目标。")
                parts = logical.strip("/").split("/")
                if len(parts) >= 3 and parts[0] == "plugins":
                    if parts[1] == "assistant-ui-composer":
                        raise PluginDevelopmentError("PLUGIN_ID_RESERVED_BY_OFFICIAL: use create_custom_plugin with a new ID.")
                    self._require_customized_source_decision(parts[1], logical)
                new_id = self._new_plugin_identity(path)
                if new_id is not None:
                    self.authority.require_create(new_id)
                    raise PluginDevelopmentError(
                        "新 Plugin 身份必须通过 create_ui_plugin 原子创建。"
                    )
                elif self.authority.intent in {"needs_decision", "explicit", "conditional"} and active is None:
                    raise PluginDevelopmentError("新增能力的源码写入前需要完成开发方案和授权。")
        if name == "mutate_ui_plugin_source" and args.get("pluginId") == "assistant-ui-composer":
            raise PluginDevelopmentError("PLUGIN_ID_RESERVED_BY_OFFICIAL: use create_custom_plugin with a new ID.")
        if name == "mutate_ui_plugin_source":
            plugin_id = args.get("pluginId")
            if isinstance(plugin_id, str):
                self._require_customized_source_decision(plugin_id)
            if active is not None and active.status == "authorized":
                if args.get("pluginId") != active.target_plugin_id:
                    raise PluginDevelopmentError("源码修改超出了已批准的 Plugin 目标。")
            elif self.authority.intent in {"needs_decision", "explicit", "conditional"}:
                raise PluginDevelopmentError("新增能力的源码写入前需要完成开发方案和授权。")

    @staticmethod
    def _blocked(call: Mapping[str, Any], error: PluginDevelopmentError) -> ToolMessage:
        return ToolMessage(
            content=json.dumps({"ok": False, "error": {
                "code": error.code, "message": str(error), "stateChanged": False,
            }}, ensure_ascii=False),
            tool_call_id=str(call.get("id") or "plugin-development-admission"),
            name=str(call.get("name") or ""),
        )

    def _observe(self, name: str, args: Mapping[str, Any], result: Any) -> None:
        if getattr(result, "status", None) == "error":
            return
        if name == "edit_file" and getattr(result, "status", None) == "success":
            path = args.get("file_path")
            if isinstance(path, str):
                logical = project_logical_path(path, self.authority.project_root)
                active = self.authority.active
                if (active is not None and active.status == "authorized"
                        and logical.startswith(f"/plugins/{active.target_plugin_id}/")):
                    self.authority.note_authorized_target_write(active.target_plugin_id)
            return
        if name == "read_file" and args.get("file_path") == _SKILL_PATH:
            content = getattr(result, "content", result)
            if isinstance(content, str) and "# UI Plugin Development" in content:
                self.authority.mark_skill_loaded()
            return
        payload = _result_payload(result)
        if payload is None or payload.get("ok") is not True:
            return
        value = payload.get("result")
        if not isinstance(value, Mapping):
            return
        if name == "inspect_ui_project" and args.get("view") == "composition":
            composition = self._complete_composition(value)
            if (composition is not None
                    and "capability.inventory" in composition.get("observationCoverage", ())
                    and isinstance(composition.get("capabilitySummaries"), list)
                    and all(isinstance(summary, Mapping)
                            and isinstance(summary.get("pluginId"), str)
                            for summary in composition["capabilitySummaries"])):
                ids = [summary["pluginId"] for summary in composition["capabilitySummaries"]
                       if isinstance(summary, Mapping)
                       and isinstance(summary.get("pluginId"), str)]
                self.authority.record_discovery(
                    plugin_inventory_complete=True, plugin_ids=ids,
                )
        if name == "inspect_ui_capabilities":
            catalog = self._complete_composition(value)
            if catalog is not None:
                if catalog.get("pluginInventoryComplete") is True:
                    self.authority.record_discovery(
                        plugin_inventory_complete=True, plugin_ids=catalog.get("pluginIds", []),
                    )
                sources = catalog.get("sources", {})
                if sources.get("inventoryComplete") is True:
                    self.authority.record_discovery(
                        source_inventory_complete=True,
                        source_plugin_ids=[item["id"].removeprefix("plugin/")
                                           for item in sources.get("items", [])
                                           if item.get("id", "").startswith("plugin/")],
                    )
        if name == "apply_agent_ui_source_item":
            item_id = args.get("itemId")
            changed_items = value.get("changedItems")
            if (value.get("operation") == "apply" and value.get("changed") is True
                    and isinstance(item_id, str) and item_id.startswith("plugin/")
                    and isinstance(changed_items, list) and item_id in changed_items):
                self.authority.record_installed_source_plugin(
                    item_id.removeprefix("plugin/")
                )
        if (name == "list_ui_plugins" and _inventory_complete(value)
                and isinstance(value.get("pluginAssets"), list)):
            ids = [plugin.get("pluginId", plugin.get("id")) for plugin in value["pluginAssets"]
                   if isinstance(plugin, Mapping) and isinstance(plugin.get("pluginId", plugin.get("id")), str)]
            self.authority.record_discovery(
                plugin_inventory_complete=len(ids) == len(value["pluginAssets"]), plugin_ids=ids,
            )
        if (name == "inspect_agent_ui_sources" and _inventory_complete(value)
                and isinstance(value.get("items"), list)):
            ids = [item["id"].removeprefix("plugin/") for item in value["items"]
                   if isinstance(item, Mapping) and isinstance(item.get("id"), str)
                   and item["id"].startswith("plugin/")]
            self.authority.record_discovery(
                source_inventory_complete=True, source_plugin_ids=ids,
            )

    def wrap_tool_call(self, request: Any, handler: Callable[[Any], Any]) -> Any:
        call = request.tool_call
        name = str(call.get("name") or "")
        args = call.get("args") if isinstance(call.get("args"), Mapping) else {}
        try:
            self._admit(name, args)
        except PluginDevelopmentError as error:
            return self._blocked(call, error)
        result = handler(request)
        self._observe(name, args, result)
        return self._guide_locale_edit_failure(name, args, result)

    async def awrap_tool_call(
        self, request: Any, handler: Callable[[Any], Awaitable[Any]],
    ) -> Any:
        call = request.tool_call
        name = str(call.get("name") or "")
        args = call.get("args") if isinstance(call.get("args"), Mapping) else {}
        try:
            self._admit(name, args)
        except PluginDevelopmentError as error:
            return self._blocked(call, error)
        result = await handler(request)
        self._observe(name, args, result)
        return self._guide_locale_edit_failure(name, args, result)

    def _guide_locale_edit_failure(self, name: str, args: Mapping[str, Any], result: Any) -> Any:
        if name != "edit_file" or not isinstance(result, ToolMessage):
            return result
        path = args.get("file_path")
        content = result.content
        if not isinstance(path, str) or not isinstance(content, str) or "String not found in file" not in content:
            return result
        logical = project_logical_path(path, self.authority.project_root)
        if logical not in _PLUGIN_LOCALE_PATHS:
            return result
        source_path = agent_ui_source_path(self.authority.project_root, logical.lstrip("/"))
        try:
            current = resolve_creator_project_file(self.authority.project_root, source_path).absolute_path.read_text(encoding="utf-8")
        except (OSError, ValueError):
            return result
        if current.count("  theme: {") != 1:
            return result
        hint = (
            "\nFor a new locale namespace in this file, use the exact single-line "
            "old_string `  theme: {` and a new_string containing the new namespace "
            "followed by the same `  theme: {` line. Do not include adjacent lines "
            "or indentation guessed from numbered read_file output. Retry edit_file directly."
        )
        return result.model_copy(update={"content": content + hint})
