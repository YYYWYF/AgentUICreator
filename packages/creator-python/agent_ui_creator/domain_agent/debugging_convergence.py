from __future__ import annotations

import json
from collections.abc import Awaitable, Callable

from langchain.agents.middleware import AgentMiddleware, ModelRequest, ModelResponse
from langchain_core.messages import SystemMessage

from ..runtime_diagnostics import RuntimeDiagnosticInspectionService
from ..validation import CreatorValidationService


class DebuggingEvidenceConvergenceMiddleware(AgentMiddleware):
    """Reuse decisive current evidence without classifying the user's task."""

    def __init__(self, validation: CreatorValidationService, runtime: RuntimeDiagnosticInspectionService):
        self.validation, self.runtime = validation, runtime

    def _request(self, request: ModelRequest) -> ModelRequest:
        validation = self.validation.current_result()
        differential = None if validation is None else validation.differential
        debugging = self.validation.debugging
        diagnostics = ()
        if differential is not None and differential.current_available:
            if debugging.clean_requested:
                diagnostics = differential.current_diagnostics
            elif debugging.targets:
                diagnostics = tuple(item for item in differential.current_diagnostics
                                    if any(debugging.static_matches(item, target) for target in debugging.targets.values()))
            elif validation.status == "failed":
                diagnostics = differential.new_diagnostics
        static = [item.to_dict() for item in diagnostics[:8]]
        runtime = self.runtime.current_result() or {}
        runtime = debugging.runtime_completion_view(runtime, self.validation.activity.revision)
        errors = runtime.get("currentErrors", []) if (
            runtime.get("diagnosticFresh") is True and runtime.get("compositionFresh") is True
        ) else []
        if not static and not errors:
            return request
        evidence = {"revision": self.validation.activity.revision,
                    "staticDiagnostics": static[:8], "runtimeDiagnostics": errors[:8]}
        return request.override(messages=[*request.messages, SystemMessage(content=(
            "Current decisive diagnostic evidence is already available. For an in-scope repair, "
            "read the implicated owner file and nearest contract before broader discovery. Do not "
            "repeat glob, root listing, Plugin inventory or diagnostic reads to rediscover known facts. "
            "Expand investigation only for a new concrete uncertainty from the target. "
            "Bind only explicitly requested existing diagnostics; unrelated pre-existing errors "
            "are workspace warnings. This evidence grants no write permission.\n"
            + json.dumps(evidence, ensure_ascii=False)
        ))])

    def wrap_model_call(self, request: ModelRequest, handler: Callable[[ModelRequest], ModelResponse]) -> ModelResponse:
        return handler(self._request(request))

    async def awrap_model_call(self, request: ModelRequest, handler: Callable[[ModelRequest], Awaitable[ModelResponse]]) -> ModelResponse:
        return await handler(self._request(request))
