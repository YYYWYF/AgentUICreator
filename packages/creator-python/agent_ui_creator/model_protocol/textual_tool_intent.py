from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

_TOOL_NAMES = (
    "read_file|edit_file|edit_file_from_read|grep|glob|ls|inspect_ui_project|"
    "inspect_app_ui_model|list_ui_plugins|inspect_ui_slots|inspect_ui_plugin|"
    "inspect_ui_services|inspect_ui_plugin_source_references|"
    "inspect_agent_ui_sources|apply_agent_ui_source_item|"
    "mutate_ui_plugin_source|mutate_app_ui_model|purge_ui_plugin"
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
_COMPLETE_CALL = re.compile(
    r"<tool_call\b[^>]*>[\s\S]*?<function\s*=\s*[^>\s]+\s*>"
    r"[\s\S]*?</function\s*>[\s\S]*?</tool_call\s*>"
    r"|<function_call\b[^>]*>[\s\S]*?</function_call\s*>"
    r"|<function\s*=\s*[^>\s]+\s*>[\s\S]*?</function\s*>",
    re.IGNORECASE,
)
_COMPLETE_NAMED_CALL = re.compile(
    rf"\b(?:{_TOOL_NAMES})\s*\(\s*[{{\[][\s\S]*?[}}\]]\s*\)"
    rf"|\b(?:{_TOOL_NAMES})\s*\{{[\s\S]*?\}}",
    re.IGNORECASE,
)
_TOOL_CALL_WRAPPER = re.compile(
    r"<tool_call\b[^>]*>([\s\S]*?)(?:</tool_call\s*>|$)", re.IGNORECASE
)
_CALL_FRAGMENT = re.compile(
    r"<function_call\b[^>]*>|<function\s*=\s*[^>\s]+\s*>", re.IGNORECASE
)


def _has_complete_call(text: str) -> bool:
    return bool(
        _COMPLETE_CALL.search(text)
        or _COMPLETE_NAMED_CALL.search(text)
        or any(
            match.group(1).strip()
            and re.search(r"</tool_call\s*>\s*$", match.group(0), re.IGNORECASE)
            for match in _TOOL_CALL_WRAPPER.finditer(text)
        )
    )


def _has_call_shape(text: str) -> bool:
    return bool(
        _has_complete_call(text)
        or any(match.group(1).strip() for match in _TOOL_CALL_WRAPPER.finditer(text))
        or _CALL_FRAGMENT.search(text)
        or any(pattern.search(text) for pattern in _PATTERNS[3:])
    )


@dataclass(frozen=True, slots=True)
class TextualToolSignals:
    unquoted_call: bool = False
    fenced_call_shape: bool = False
    fenced_complete_call: bool = False
    inline_complete_call: bool = False
    quoted_literal: bool = False
    outside_fences_text: bool = False


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


def textual_tool_signals(content: Any) -> TextualToolSignals:
    """Describe visible call-shaped text without granting it execution authority."""
    text = _text_content(content)
    fences = list(_FENCED_CODE.finditer(text))
    outside = _FENCED_CODE.sub("", text)
    unquoted = _INLINE_CODE.sub("", outside)
    inline = [match.group(0) for match in _INLINE_CODE.finditer(outside)]
    return TextualToolSignals(
        unquoted_call=any(pattern.search(unquoted) for pattern in _PATTERNS),
        fenced_call_shape=any(_has_call_shape(match.group(2)) for match in fences),
        fenced_complete_call=any(_has_complete_call(match.group(2)) for match in fences),
        inline_complete_call=any(_has_complete_call(part) for part in inline),
        quoted_literal=any(
            any(pattern.search(part) for pattern in _PATTERNS)
            for part in [*inline, *(match.group(2) for match in fences)]
        ),
        outside_fences_text=bool(unquoted.strip()),
    )


def has_textual_tool_intent(content: Any) -> bool:
    """Report call-shaped text, including fenced fragments beside prose."""
    signals = textual_tool_signals(content)
    return signals.unquoted_call or signals.fenced_call_shape
