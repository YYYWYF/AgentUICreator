from __future__ import annotations

import json
from hashlib import sha256
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from langchain.agents.middleware import AgentMiddleware, ModelRequest, ModelResponse
from langchain_core.messages import SystemMessage

from ..operations.models import CreatorAuthoringHandoff
from ..project_paths import agent_ui_source_root
from ..verification_policy import CreatorVerificationMode
from .prompt import CREATOR_CORE_PROMPT


_MARKER = "CREATOR_CURRENT_PROJECT_CONTEXT_V1 "
_CORE_KNOWLEDGE_ID = sha256(CREATOR_CORE_PROMPT.encode("utf-8")).hexdigest()


def _virtual_path(path: str | None) -> str | None:
    return None if path is None else f"/{path.lstrip('/')}"


class CreatorProjectContextMiddleware(AgentMiddleware):
    """Supply one current navigation projection per model request, outside history."""

    def __init__(
        self, project_root: str | Path, *, permission: str,
        verification_mode: CreatorVerificationMode,
        handoff: CreatorAuthoringHandoff | None = None,
        logger: Any = None,
    ) -> None:
        self.project_root = Path(project_root)
        self.permission = permission
        self.verification_mode = verification_mode
        self.handoff = handoff
        self.logger = logger
        self.last_context_chars = 0

    def _message(self) -> SystemMessage:
        try:
            source_root = agent_ui_source_root(self.project_root)
        except (OSError, ValueError):
            source_root = None
        context: dict[str, object] = {
            "workspaceRoot": "/",
            "sourceRoot": None if source_root is None else f"/{source_root}",
            "permission": self.permission,
            "verificationMode": self.verification_mode,
            "source": ".agent-ui/project.json",
        }
        if self.handoff is not None:
            context["resolvedOwner"] = {
                "kind": self.handoff.kind,
                "targetId": self.handoff.targetId,
                "ownerPath": _virtual_path(self.handoff.ownerPath),
                "ownerRoot": _virtual_path(self.handoff.ownerRoot),
                "definitionPath": _virtual_path(self.handoff.definitionPath),
            }
        content = _MARKER + json.dumps(context, ensure_ascii=False, separators=(",", ":"))
        self.last_context_chars = len(content)
        if self.logger is not None:
            self.logger.record("creator_project_context", {
                "chars": self.last_context_chars,
                "utf8Bytes": len(content.encode("utf-8")),
                "source": ".agent-ui/project.json",
                "sourceRootKnown": source_root is not None,
                "ownerResolved": self.handoff is not None,
                "coreKnowledgeId": _CORE_KNOWLEDGE_ID,
            })
        return SystemMessage(content=content)

    def _request(self, request: ModelRequest) -> ModelRequest:
        # A checkpoint may contain older project context. Replace it in this
        # model request; never append another context message to graph state.
        messages = [message for message in request.messages
                    if not (isinstance(message, SystemMessage)
                            and isinstance(message.content, str)
                            and message.content.startswith(_MARKER))]
        return request.override(messages=[self._message(), *messages])

    def wrap_model_call(
        self, request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelResponse:
        return handler(self._request(request))

    async def awrap_model_call(
        self, request: ModelRequest,
        handler: Callable[[ModelRequest], Awaitable[ModelResponse]],
    ) -> ModelResponse:
        return await handler(self._request(request))
