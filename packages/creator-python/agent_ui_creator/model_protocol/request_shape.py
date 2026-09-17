from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any


_MAX_TRACE_LABEL_LENGTH = 120
_MAX_OFFERED_TOOL_NAMES = 32


def _trace_label(value: Any) -> str:
    return str(value)[:_MAX_TRACE_LABEL_LENGTH]


def _tool_name(tool: Any) -> str:
    if isinstance(tool, Mapping):
        direct = tool.get("name")
        if direct:
            return str(direct)
        function = tool.get("function")
        if isinstance(function, Mapping):
            return str(function.get("name") or "")
        return ""
    return str(getattr(tool, "name", "") or "")


def _serialized_chars(value: Any) -> int:
    try:
        return len(
            json.dumps(value, ensure_ascii=False, default=str, separators=(",", ":"))
        )
    except (TypeError, ValueError):
        return len(repr(value))


def _content_chars(content: Any) -> int:
    if isinstance(content, str):
        return len(content)
    if isinstance(content, list):
        return sum(
            len(block)
            if isinstance(block, str)
            else len(block.get("text"))
            if isinstance(block, Mapping) and isinstance(block.get("text"), str)
            else _serialized_chars(block)
            for block in content
        )
    return _serialized_chars(content)


def _tool_schema(tool: Any) -> Any:
    if isinstance(tool, Mapping):
        return tool
    getter = getattr(tool, "get_input_schema", None)
    if not callable(getter):
        return None
    try:
        schema = getter()
    except Exception:
        return None
    if isinstance(schema, Mapping):
        return schema
    for method_name in ("model_json_schema", "schema"):
        converter = getattr(schema, method_name, None)
        if callable(converter):
            try:
                value = converter()
            except Exception:
                return None
            return value if isinstance(value, Mapping) else None
    return None


def request_shape(request: Any) -> dict[str, object]:
    """Return bounded, content-free shape data for one model request."""

    messages = list(getattr(request, "messages", ()) or ())
    system_message = getattr(request, "system_message", None)
    if system_message is not None:
        messages.append(system_message)
    tools = list(getattr(request, "tools", ()) or ())
    schema_sizes = [
        (_tool_name(tool), _serialized_chars(schema))
        for tool in tools
        if (schema := _tool_schema(tool)) is not None
    ]
    max_tool_name: str | None = None
    max_tool_chars = 0
    if schema_sizes:
        max_tool_name, max_tool_chars = max(schema_sizes, key=lambda item: item[1])
    return {
        "requestMessageCount": len(messages),
        "requestMessageChars": sum(
            _content_chars(getattr(message, "content", message))
            for message in messages
        ),
        "requestToolCount": len(tools),
        "requestToolSchemaChars": sum(size for _, size in schema_sizes),
        "requestMaxToolSchemaChars": max_tool_chars,
        "requestMaxToolSchemaName": max_tool_name,
        "offeredToolNames": tuple(
            _trace_label(name)
            for name in (_tool_name(tool) for tool in tools)
            if name
        )[:_MAX_OFFERED_TOOL_NAMES],
    }
