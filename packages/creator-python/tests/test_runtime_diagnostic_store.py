from __future__ import annotations

from agent_ui_creator.runtime_diagnostics import (
    RuntimeDiagnosticEnvelope,
    RuntimeDiagnosticStore,
)


def test_runtime_diagnostic_store_records_forwarded_composition():
    store = RuntimeDiagnosticStore()
    envelope = RuntimeDiagnosticEnvelope.model_validate(
        {
            "threadId": "thread-1",
            "composition": {
                "schemaVersion": 1,
                "appUIModelHash": "a" * 64,
                "observedAt": "2026-09-04T00:00:00.000Z",
                "instances": [
                    {
                        "instanceId": "messages-main",
                        "pluginId": "antd-x-message-list",
                        "slotId": "conversation.messages",
                    }
                ],
            },
        }
    )

    assert store.record(envelope) == {"accepted": True}
    assert store._scopes["thread-1"].compositions[0]["instances"] == [
        {
            "instanceId": "messages-main",
            "pluginId": "antd-x-message-list",
            "slotId": "conversation.messages",
        }
    ]
