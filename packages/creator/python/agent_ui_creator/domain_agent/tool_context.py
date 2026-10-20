"""Model-only inspection projection: deduplication and superseded-history budgets.

Never changes checkpoint messages, tool results, permissions or read evidence.
References always point backward to a full value still present in this request.
"""
from __future__ import annotations

import hashlib
import json
from collections.abc import Awaitable, Callable

from langchain.agents.middleware import AgentMiddleware, ModelRequest, ModelResponse
from langchain_core.messages import AIMessage, ToolMessage


INSPECTION_CONTEXT_SOFT_LIMIT = 100_000
_ARCHIVABLE_INSPECTIONS = frozenset({
    "inspect_ui_project", "inspect_app_ui_model", "list_ui_plugins", "inspect_ui_slots",
    "inspect_ui_services", "inspect_ui_capabilities", "inspect_agent_ui_sources",
    "inspect_runtime_errors", "inspect_runtime_layout", "inspect_static_diagnostics",
})


def compact_superseded_inspections(messages, *, budget=INSPECTION_CONTEXT_SOFT_LIMIT):
    """Archive only successful observations superseded by a newer same-query read.

    Preserve all user/assistant text, source reads, mutations, approvals, errors,
    plugin contract anchors and the latest complete paginated snapshot per query.
    This is a model-only projection: checkpoint and Host evidence stay unchanged.
    The budget is soft; protected evidence is never dropped just to meet a cap.
    """
    total = sum(len(item.content) for item in messages if isinstance(item.content, str))
    if total <= budget:
        return messages, 0
    arguments = {}
    recent = {index for index, item in enumerate(messages) if isinstance(item, ToolMessage)}
    recent = set(sorted(recent)[-8:])
    records = {}
    latest = {}
    snapshot_queries = {}
    for index, item in enumerate(messages):
        if isinstance(item, AIMessage):
            for call in item.tool_calls:
                args = call.get("args") or {}
                arguments[call.get("id")] = json.dumps(
                    {key: value for key, value in args.items() if key != "cursor"},
                    sort_keys=True, ensure_ascii=False,
                )
        if (not isinstance(item, ToolMessage) or item.name not in _ARCHIVABLE_INSPECTIONS
                or item.status == "error" or not isinstance(item.content, str)):
            continue
        try:
            value = json.loads(item.content)
        except ValueError:
            continue
        if not isinstance(value, dict) or value.get("ok") is not True or not isinstance(value.get("result"), dict):
            continue
        result = value["result"]
        # A cursor-less call's arguments are necessary to distinguish view/detail,
        # target and diagnostics scopes. Unknown calls are not safe to supersede.
        if item.tool_call_id not in arguments:
            continue
        query = (item.name, arguments[item.tool_call_id])
        snapshot = result.get("snapshotHash")
        if isinstance(snapshot, str):
            snapshot_key = (item.name, snapshot)
            if result.get("pageOffset", 0) == 0:
                snapshot_queries[snapshot_key] = query
            elif snapshot_key not in snapshot_queries:
                continue
            query = snapshot_queries[snapshot_key]
        group = (query, snapshot if isinstance(snapshot, str) else index)
        records.setdefault(group, []).append(index)
        latest[query] = group
    projected = list(messages)
    saved = 0
    for group, indices in records.items():
        if total <= budget:
            break
        if latest[group[0]] == group or recent.intersection(indices):
            continue
        anchor = messages[records[latest[group[0]]][0]].tool_call_id
        for index in indices:
            item = messages[index]
            replacement = json.dumps({"ok": True, "result": {
                "historicalObservationOmitted": True, "supersededByToolCallId": anchor,
                "interpretation": "Older same-query inspection omitted from model context. Use the retained newer snapshot; refresh if current facts are needed. This is not write authority or file-read evidence.",
            }}, separators=(",", ":"))
            if len(replacement) >= len(item.content):
                continue
            amount = len(item.content) - len(replacement)
            projected[index] = item.model_copy(update={"content": replacement})
            total -= amount
            saved += amount
    return projected, saved


def compact_inspection_messages(messages):
    seen: dict[str, str] = {}
    output = []
    saved = 0

    def reference(value, location, identity=""):
        nonlocal saved
        encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        if len(encoded) < 240:
            return value
        fingerprint = hashlib.sha256((identity + encoded).encode()).hexdigest()
        prior = seen.get(fingerprint)
        if prior is None:
            seen[fingerprint] = location
            return value
        replacement = {"unchanged": True, "contextReference": prior}
        # Identity/navigation remains directly available; references are not grants.
        if isinstance(value, dict):
            replacement.update({key: value[key] for key in
                                ("pluginId", "id", "name", "status", "ownership", "entryPath", "entryHash", "implementationOwnership")
                                if key in value})
        saved += max(0, len(encoded) - len(json.dumps(replacement, ensure_ascii=False)))
        return replacement

    for message in messages:
        if not isinstance(message, ToolMessage) or message.name != "inspect_ui_plugin" or not isinstance(message.content, str):
            output.append(message)
            continue
        try:
            payload = json.loads(message.content)
        except ValueError:
            output.append(message)
            continue
        result = payload.get("result") if isinstance(payload, dict) and payload.get("ok") is True else None
        if not isinstance(result, dict):
            output.append(message)
            continue
        # Parsed JSON is a fresh projection. The original ToolMessage is untouched.
        for key in ("asset", "manifest", "definitionSource", "services", "compositionParents", "instances", "files"):
            if key in result:
                result[key] = reference(result[key], f"tool:{message.tool_call_id}#/result/{key}")
        sections = [(result.get("sharedTypes"), "sharedTypes")]
        application = result.get("application")
        if isinstance(application, dict):
            if "usageGuide" in application:
                application["usageGuide"] = reference(application["usageGuide"], f"tool:{message.tool_call_id}#/result/application/usageGuide")
            sections.append((application.get("sharedTypes"), "application/sharedTypes"))
        for shared, prefix in sections:
            if not isinstance(shared, dict):
                continue
            for index, symbol in enumerate(shared.get("symbols", [])):
                if not isinstance(symbol, dict) or symbol.get("status") != "available":
                    continue
                location = f"tool:{message.tool_call_id}#/result/{prefix}/symbols/{index}"
                # Remember full symbol before compacting its repeated presentation.
                identity = f"{shared.get('module')}@{shared.get('packageVersion')}"
                compact = reference(symbol, location, identity)
                if compact is not symbol:
                    shared["symbols"][index] = compact
                elif isinstance(symbol.get("presentationContract"), dict):
                    symbol["presentationContract"] = reference(symbol["presentationContract"], location + "/presentationContract", identity)
        output.append(message.model_copy(update={"content": json.dumps(payload, ensure_ascii=False, separators=(",", ":"))}))
    return output, saved


class ToolContextCompactionMiddleware(AgentMiddleware):
    def __init__(self, metrics=None):
        self.metrics = metrics

    def _request(self, request: ModelRequest) -> ModelRequest:
        messages, saved = compact_superseded_inspections(request.messages)
        messages, duplicates_saved = compact_inspection_messages(messages)
        saved += duplicates_saved
        if saved and self.metrics is not None:
            actual = sum(len(old.content) - len(new.content) for old, new in zip(request.messages, messages)
                         if isinstance(old.content, str) and isinstance(new.content, str))
            self.metrics.contextCompactionRequests += 1
            self.metrics.contextCompactionSavedChars += max(0, actual)
            self.metrics.contextCompactionMaxSavedChars = max(self.metrics.contextCompactionMaxSavedChars, actual)
        return request.override(messages=messages) if saved else request

    def wrap_model_call(self, request: ModelRequest, handler: Callable[[ModelRequest], ModelResponse]) -> ModelResponse:
        return handler(self._request(request))

    async def awrap_model_call(self, request: ModelRequest, handler: Callable[[ModelRequest], Awaitable[ModelResponse]]) -> ModelResponse:
        return await handler(self._request(request))
