from __future__ import annotations

import json
import hashlib
import re
from collections.abc import Awaitable, Callable, Mapping, Sequence
from typing import Any

from langchain.agents.middleware import AgentMiddleware, ModelRequest, ModelResponse
from langchain_core.messages import ToolMessage

from ..resource_scope import project_logical_path
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
    "edit_file", "create_ui_plugin", "mutate_ui_plugin_source",
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

    def __init__(self, authority: PluginDevelopmentAuthority) -> None:
        self.authority = authority
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
        if name == "create_ui_plugin":
            plugin_id = args.get("pluginId")
            if not isinstance(plugin_id, str):
                raise PluginDevelopmentError("创建目标 Plugin ID 无效。")
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
                    self._require_customized_source_decision(parts[1], logical)
                new_id = self._new_plugin_identity(path)
                if new_id is not None:
                    self.authority.require_create(new_id)
                    raise PluginDevelopmentError(
                        "新 Plugin 身份必须通过 create_ui_plugin 原子创建。"
                    )
                elif self.authority.intent in {"needs_decision", "explicit", "conditional"} and active is None:
                    raise PluginDevelopmentError("新增能力的源码写入前需要完成开发方案和授权。")
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
        return result

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
        return result
