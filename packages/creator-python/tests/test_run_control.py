from __future__ import annotations

import pytest

from agent_ui_creator.run_control import (
    CreatorRunControlState,
    TerminalBlockerStop,
)


def test_terminal_blocker_is_run_scoped_and_fail_closed():
    state = CreatorRunControlState()
    state.observe_protocol_counts(model_calls=2, tool_calls=1)

    assert state.block(
        category="workspace_integrity",
        code="PLUGIN_CHILD_SLOT_CONTRACT_INVALID",
        source="mutate_app_ui_model",
        message="Selected plugins contain inconsistent child Slots.",
        details={"pluginId": "conversation-surface"},
        recovery={
            "action": "stop_and_report_blocker",
            "automaticRepairAllowed": False,
        },
    )
    assert state.status == "blocked"
    assert state.block(
        category="workspace_integrity",
        code="OTHER",
        source="validate_creator_changes",
        message="must not replace the first blocker",
    ) is False

    with pytest.raises(TerminalBlockerStop):
        state.assert_runnable()

    assert state.blocker_dict() == {
        "category": "workspace_integrity",
        "code": "PLUGIN_CHILD_SLOT_CONTRACT_INVALID",
        "source": "mutate_app_ui_model",
        "message": "Selected plugins contain inconsistent child Slots.",
        "details": {"pluginId": "conversation-surface"},
        "recovery": {
            "action": "stop_and_report_blocker",
            "automaticRepairAllowed": False,
        },
    }
    assert state.metrics() == {
        "terminalBlockerCount": 1,
        "terminalBlockerCode": "PLUGIN_CHILD_SLOT_CONTRACT_INVALID",
        "terminalBlockerSource": "mutate_app_ui_model",
        "terminalBlockerAtModelCall": 2,
        "modelCallsAfterTerminalBlocker": 0,
        "toolCallsAfterTerminalBlocker": 0,
    }
