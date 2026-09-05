from __future__ import annotations

import json
from collections.abc import Awaitable, Callable

from langchain.agents.middleware import AgentMiddleware, ModelRequest, ModelResponse
from langchain_core.messages import AIMessage, HumanMessage

from ..model_protocol.errors import ModelToolProtocolError
from ..model_protocol.trace import ToolProtocolMetrics
from .tool_policy import READ_ONLY_TOOL_NAMES

MAX_READ_BATCH_SIZE = 3
BATCH_POLICY_REPAIR_PROMPT = """Your previous tool batch violates the Creator domain execution policy.
Read-only tools may be batched together, up to three independent calls with distinct
tool name + arguments. Request only necessary reads whose arguments are already known.
A side-effecting tool must be the only tool call in the response.
Re-issue only the next valid action using the structured tool interface."""


def is_valid_domain_tool_batch(response: ModelResponse) -> bool:
    message = next(
        (item for item in reversed(response.result) if isinstance(item, AIMessage)),
        None,
    )
    calls = [] if message is None else message.tool_calls
    if len(calls) <= 1:
        return True
    if len(calls) > MAX_READ_BATCH_SIZE:
        return False
    signatures: set[str] = set()
    for call in calls:
        if call["name"] not in READ_ONLY_TOOL_NAMES:
            return False
        signature = json.dumps(
            [call["name"], call["args"]], sort_keys=True, ensure_ascii=False
        )
        if signature in signatures:
            return False
        signatures.add(signature)
    return True


class DomainToolBatchPolicyMiddleware(AgentMiddleware):
    """Validate before ToolNode dispatch; DeepAgent owns all tool execution.

    Wrap ToolProtocolMiddleware so both the initial request and one semantic
    repair pass through its protocol checks, model counter and hard limit.
    """

    def __init__(self, *, metrics: ToolProtocolMetrics) -> None:
        self.metrics = metrics

    def _repair_request(self, request: ModelRequest) -> ModelRequest:
        self.metrics.batchPolicyViolations += 1
        self.metrics.batchPolicyRepairAttempts += 1
        # Do not append the rejected AIMessage: its calls were never dispatched
        # and would leave unmatched tool call ids in provider history.
        return request.override(
            messages=[*request.messages, HumanMessage(content=BATCH_POLICY_REPAIR_PROMPT)]
        )

    def _finish_repair(self, response: ModelResponse) -> ModelResponse:
        if not is_valid_domain_tool_batch(response):
            self.metrics.batchPolicyViolations += 1
            raise ModelToolProtocolError(
                "Creator domain tool batch violates execution policy after one repair attempt."
            )
        self.metrics.batchPolicyRepairSuccesses += 1
        return response

    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelResponse:
        response = handler(request)
        if is_valid_domain_tool_batch(response):
            return response
        return self._finish_repair(handler(self._repair_request(request)))

    async def awrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], Awaitable[ModelResponse]],
    ) -> ModelResponse:
        response = await handler(request)
        if is_valid_domain_tool_batch(response):
            return response
        return self._finish_repair(await handler(self._repair_request(request)))
