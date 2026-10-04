from __future__ import annotations

import re

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
_INLINE_CODE = re.compile(r"(?<!`)`(?!`)[^`\n]*`(?!`)")


def has_textual_tool_intent(content: str) -> bool:
    """Recognize textual calls without interpreting them as trusted tool calls."""
    unquoted_content = _INLINE_CODE.sub("", content)
    return any(pattern.search(unquoted_content) for pattern in _PATTERNS)
