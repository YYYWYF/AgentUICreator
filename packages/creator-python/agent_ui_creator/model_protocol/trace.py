from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(frozen=True, slots=True)
class ModelCallTrace:
    sequence: int
    durationMs: int
    finishReason: str | None
    contentBlockTypes: tuple[str, ...]
    toolCallNames: tuple[str, ...]
    toolCallCount: int
    invalidToolCallCount: int
    hasReasoningContent: bool
    reasoningContentRetained: bool
    inputTokens: int | None
    outputTokens: int | None
    providerResponse: dict[str, Any] | None = None
    langChainProviderMetadata: dict[str, Any] | None = None
    langChainPseudoToolNames: tuple[str, ...] = ()
    translationMismatch: str | None = None
    toolCallOrigin: str | None = None

    def to_dict(self) -> dict[str, Any]:
        value = asdict(self)
        value["contentBlockTypes"] = list(self.contentBlockTypes)
        value["toolCallNames"] = list(self.toolCallNames)
        value["langChainPseudoToolNames"] = list(self.langChainPseudoToolNames)
        return value


@dataclass(slots=True)
class ToolProtocolMetrics:
    modelCalls: int = 0
    toolCalls: int = 0
    validToolCalls: int = 0
    invalidToolCalls: int = 0
    pseudoToolCallsDetected: int = 0
    pseudoToolCallsRecovered: int = 0
    protocolRepairAttempts: int = 0
    protocolRepairSuccesses: int = 0
    protocolRepairFailures: int = 0
    batchPolicyViolations: int = 0
    batchPolicyRepairAttempts: int = 0
    batchPolicyRepairSuccesses: int = 0
    toolArgumentParseFailures: int = 0
    missingToolCallIds: int = 0
    repeatedToolLoops: int = 0
    inputTokens: int = 0
    outputTokens: int = 0
    traces: list[ModelCallTrace] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        value = asdict(self)
        value["traces"] = [trace.to_dict() for trace in self.traces]
        return value
