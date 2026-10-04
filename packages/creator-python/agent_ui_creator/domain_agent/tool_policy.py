from __future__ import annotations

from collections.abc import Awaitable, Callable, Sequence
from typing import Any

from langchain.agents.middleware import AgentMiddleware, ModelRequest, ModelResponse

from ..domain_tools import DOMAIN_READ_TOOL_NAMES
from ..minimal_agent.tool_policy import ALLOWED_MINIMAL_TOOLS, tool_name
from ..verification_policy import (
    CreatorVerificationMode,
    DEFAULT_CREATOR_VERIFICATION_MODE,
)

ALLOWED_DOMAIN_READ_TOOLS = (
    *ALLOWED_MINIMAL_TOOLS,
    *DOMAIN_READ_TOOL_NAMES,
    "inspect_runtime_layout",
    "ask_user_question",
)
_ALLOWED_DOMAIN_READ_TOOL_SET = frozenset(ALLOWED_DOMAIN_READ_TOOLS)
DOMAIN_WRITE_TOOL_NAMES = (
    *DOMAIN_READ_TOOL_NAMES,
    "inspect_runtime_layout",
    "ask_user_question",
    "create_ui_plugin",
    "prepare_ui_plugin_development",
    "mutate_ui_plugin_source",
    "prepare_ui_service_contract_change",
    "create_ui_service_contract",
    "mutate_ui_service_contract",
    "mutate_app_ui_model",
    "edit_file_from_read",
    "apply_agent_ui_source_item",
    "validate_creator_changes",
    "inspect_runtime_errors",
    "verify_ui_plugin_behavior",
    "inspect_ui_plugin_delivery",
)
ALLOWED_DOMAIN_WRITE_TOOLS = (*ALLOWED_MINIMAL_TOOLS, *DOMAIN_WRITE_TOOL_NAMES)
_ALLOWED_DOMAIN_WRITE_TOOL_SET = frozenset(ALLOWED_DOMAIN_WRITE_TOOLS)
ANSWER_ONLY_FORBIDDEN_TOOL_NAMES = _ALLOWED_DOMAIN_WRITE_TOOL_SET | frozenset(
    {"write_file", "delete", "execute", "write_todos", "task"}
)
RUNTIME_VERIFICATION_TOOL_NAMES = frozenset(
    {"inspect_runtime_errors", "inspect_runtime_layout", "verify_ui_plugin_behavior"}
)

# Every future side-effecting domain tool must be explicitly classified here.
SIDE_EFFECT_TOOL_NAMES = frozenset(
    {
        "edit_file",
        "edit_file_from_read",
        "create_ui_plugin",
        "prepare_ui_plugin_development",
        "mutate_ui_plugin_source",
        "prepare_ui_service_contract_change",
        "create_ui_service_contract",
        "mutate_ui_service_contract",
        "mutate_app_ui_model",
        "apply_agent_ui_source_item",
        "verify_ui_plugin_behavior",
    }
)
ALLOWED_INSPECT_READ_ONLY_TOOLS = tuple(
    name for name in ALLOWED_DOMAIN_READ_TOOLS
    if name not in SIDE_EFFECT_TOOL_NAMES
)
READ_ONLY_TOOL_NAMES = _ALLOWED_DOMAIN_WRITE_TOOL_SET - SIDE_EFFECT_TOOL_NAMES


def _runtime_tools_enabled(verification_mode: CreatorVerificationMode) -> bool:
    return verification_mode == "static_and_runtime"


def filter_domain_read_tools(
    tools: Sequence[Any],
    *,
    verification_mode: CreatorVerificationMode = DEFAULT_CREATOR_VERIFICATION_MODE,
    inspect_read_only: bool = False,
    answer_only: bool = False,
) -> list[Any]:
    if answer_only:
        return []
    allowed = (
        frozenset(ALLOWED_INSPECT_READ_ONLY_TOOLS)
        if inspect_read_only else _ALLOWED_DOMAIN_READ_TOOL_SET
    )
    return [
        tool
        for tool in tools
        if tool_name(tool) in allowed
        and (
            _runtime_tools_enabled(verification_mode)
            or tool_name(tool) not in RUNTIME_VERIFICATION_TOOL_NAMES
        )
    ]


def filter_domain_write_tools(
    tools: Sequence[Any],
    *,
    verification_mode: CreatorVerificationMode = DEFAULT_CREATOR_VERIFICATION_MODE,
) -> list[Any]:
    return [
        tool
        for tool in tools
        if tool_name(tool) in _ALLOWED_DOMAIN_WRITE_TOOL_SET
        and (
            _runtime_tools_enabled(verification_mode)
            or tool_name(tool) not in RUNTIME_VERIFICATION_TOOL_NAMES
        )
    ]


class DomainReadToolPolicyMiddleware(AgentMiddleware):
    """Apply the Phase-3A filesystem plus domain-read allowlist on every model call."""

    def __init__(
        self,
        verification_mode: CreatorVerificationMode = DEFAULT_CREATOR_VERIFICATION_MODE,
        *,
        inspect_read_only: bool = False,
        answer_only: bool = False,
    ) -> None:
        self.verification_mode = verification_mode
        self.inspect_read_only = inspect_read_only
        self.answer_only = answer_only

    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelResponse:
        return handler(
            request.override(
                tools=filter_domain_read_tools(
                    request.tools,
                    verification_mode=self.verification_mode,
                    inspect_read_only=self.inspect_read_only,
                    answer_only=self.answer_only,
                )
            )
        )

    async def awrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], Awaitable[ModelResponse]],
    ) -> ModelResponse:
        return await handler(
            request.override(
                tools=filter_domain_read_tools(
                    request.tools,
                    verification_mode=self.verification_mode,
                    inspect_read_only=self.inspect_read_only,
                    answer_only=self.answer_only,
                )
            )
        )


class DomainWriteToolPolicyMiddleware(AgentMiddleware):
    """Expose bounded filesystem, domain reads, and semantic AppUIModel mutation."""

    def __init__(
        self,
        verification_mode: CreatorVerificationMode = DEFAULT_CREATOR_VERIFICATION_MODE,
    ) -> None:
        self.verification_mode = verification_mode

    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelResponse:
        return handler(
            request.override(
                tools=filter_domain_write_tools(
                    request.tools,
                    verification_mode=self.verification_mode,
                )
            )
        )

    async def awrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], Awaitable[ModelResponse]],
    ) -> ModelResponse:
        return await handler(
            request.override(
                tools=filter_domain_write_tools(
                    request.tools,
                    verification_mode=self.verification_mode,
                )
            )
        )
