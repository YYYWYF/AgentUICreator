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


class ModelTransportError(CreatorAgentError):
    """A bounded transient model transport retry budget was exhausted."""

    code = "MODEL_TRANSPORT_RETRY_EXHAUSTED"
    category = "infrastructure"
    recoverable = True

    def __init__(
        self,
        *,
        attempts: int,
        error_type: str,
        cause_type: str | None = None,
        cause_message: str | None = None,
        status_code: int | None = None,
        provider_request_id: str | None = None,
    ) -> None:
        self.attempts = max(0, int(attempts))
        self.error_type = error_type
        self.cause_type = cause_type
        self.cause_message = cause_message
        self.status_code = status_code
        self.provider_request_id = provider_request_id
        super().__init__(
            f"Creator model transport retry exhausted after {self.attempts} attempts."
        )

    def to_dict(self) -> dict[str, object]:
        details = {
            "category": self.category,
            "code": self.code,
            "recoverable": self.recoverable,
            "attempts": self.attempts,
            "errorType": self.error_type,
            "causeType": self.cause_type,
            "statusCode": self.status_code,
            "providerRequestId": self.provider_request_id,
        }
        if self.cause_message is not None:
            details["causeMessage"] = self.cause_message
        return details


class DeepAgentEventStreamUnavailableError(CreatorAgentError):
    code = "DEEPAGENT_EVENT_STREAM_UNAVAILABLE"
