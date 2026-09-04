from types import SimpleNamespace

import pytest

from agent_ui_creator.minimal_agent.path_policy import (
    MinimalAgentPathPolicy,
    PolicyFilesystemBackend,
)
from agent_ui_creator.minimal_agent.runtime_guard import MinimalAgentRuntimeGuard
from agent_ui_creator.model_protocol.errors import AgentNoProgressError


def test_three_identical_tools_without_mutation_trip_no_progress(tmp_path):
    guard = MinimalAgentRuntimeGuard(
        PolicyFilesystemBackend(tmp_path, MinimalAgentPathPolicy.conformance())
    )
    request = SimpleNamespace(
        tool_call={"name": "grep", "args": {"pattern": "x"}, "id": "call"}
    )
    handler = lambda _request: SimpleNamespace(content="No matches", status="success")

    guard.wrap_tool_call(request, handler)
    guard.wrap_tool_call(request, handler)
    guard.wrap_tool_call(request, handler)

    assert guard.no_progress is True
    with pytest.raises(AgentNoProgressError):
        guard.raise_terminal_error()
