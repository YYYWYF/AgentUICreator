"""Lossless references for repeated inspection facts in model-only context.

Never changes checkpoint messages, tool results, permissions or read evidence.
References always point backward to a full value still present in this request.
"""
from __future__ import annotations

import hashlib
import json
from collections.abc import Awaitable, Callable

from langchain.agents.middleware import AgentMiddleware, ModelRequest, ModelResponse
from langchain_core.messages import ToolMessage


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
        messages, saved = compact_inspection_messages(request.messages)
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
