from __future__ import annotations


class CreatorAgentError(RuntimeError):
    code = "CREATOR_AGENT_ERROR"

    def __init__(self, message: str, *, code: str | None = None):
        super().__init__(message)
        self.code = code or self.code


class ModelToolProtocolError(CreatorAgentError):
    code = "MODEL_TOOL_PROTOCOL_ERROR"


class AgentNoProgressError(CreatorAgentError):
    code = "AGENT_NO_PROGRESS"


class ToolPermissionDeniedError(CreatorAgentError):
    code = "TOOL_PERMISSION_DENIED"


class ModelTimeoutError(CreatorAgentError):
    code = "MODEL_TIMEOUT"


class DeepAgentEventStreamUnavailableError(CreatorAgentError):
    code = "DEEPAGENT_EVENT_STREAM_UNAVAILABLE"
