from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any

_TOOL_NAMES = (
    "read_file|edit_file|edit_file_from_read|grep|glob|ls|inspect_ui_project|"
    "inspect_app_ui_model|list_ui_plugins|inspect_ui_slots|inspect_ui_plugin|"
    "inspect_ui_services|inspect_ui_plugin_source_references|"
    "inspect_agent_ui_sources|apply_agent_ui_source_item|"
    "mutate_ui_plugin_source|mutate_app_ui_model"
)
_PATTERNS = (
    re.compile(r"<tool_call\b", re.IGNORECASE),
    re.compile(r"<function_call\b", re.IGNORECASE),
    re.compile(r"<function\s*=\s*[^>\s]+\s*>", re.IGNORECASE),
    re.compile(rf"\b(?:{_TOOL_NAMES})\s*\(\s*[{{\[]", re.IGNORECASE),
    re.compile(rf"^[`\s]*(?:{_TOOL_NAMES})\s*\{{", re.IGNORECASE | re.MULTILINE),
)
_INLINE_CODE = re.compile(r"(?<!`)(`+)(?!`)[^\n]*?(?<!`)\1(?!`)")
_FENCED_CODE = re.compile(
    r"(?m)^ {0,3}(`{3,}|~{3,})[^\n]*\n([\s\S]*?)^ {0,3}\1[ \t]*$"
)


def _text_content(content: Any) -> str:
    """Read only visible text; adjacent text blocks are one continuous response."""
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""
    parts: list[str] = []
    for block in content:
        if isinstance(block, str):
            parts.append(block)
        elif isinstance(block, Mapping) and block.get("type") == "text":
            value = block.get("text")
            if isinstance(value, str):
                parts.append(value)
        else:
            parts.append("\n")
    return "".join(parts)


def has_textual_tool_intent(content: Any) -> bool:
    """Recognize textual calls without interpreting them as trusted tool calls."""
    text = _text_content(content)
    fences = list(_FENCED_CODE.finditer(text))
    outside = _FENCED_CODE.sub("", text)
    unquoted = _INLINE_CODE.sub("", outside)
    if any(pattern.search(unquoted) for pattern in _PATTERNS):
        return True
    # A standalone fenced call is still an attempted call. A fence embedded in
    # an explanation is a quotation; it does not grant execution authority.
    return not unquoted.strip() and any(
        any(pattern.search(match.group(2)) for pattern in _PATTERNS)
        for match in fences
    )
