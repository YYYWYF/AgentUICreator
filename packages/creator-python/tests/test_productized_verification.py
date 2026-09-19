from __future__ import annotations

import asyncio
from types import SimpleNamespace

from agent_ui_creator.operations import (
    CompositionOperationVerificationService,
    resolve_runtime_plugin_slot_id,
)


class _Validation:
    async def ensure_baseline(self) -> None:
        pass

    async def validate(self, *, mode: str):
        assert mode == "delta"
        return SimpleNamespace(status="passed")


class _Runtime:
    def __init__(self, result: dict[str, object]) -> None:
        self.result = result

    async def inspect_host(self) -> dict[str, object]:
        return self.result


def test_workspace_reflow_rejects_a_narrow_surviving_center():
    expected_fill = [{
        "instanceId": "surface-main", "region": "center", "axis": "width", "trackIndex": 0,
    }]
    runtime = {
        "runtimeStatus": "passed",
        "compositionFresh": True,
        "compositionVerified": True,
        "currentHash": "c" * 64,
        "currentErrors": [],
        "runtimeInstances": [{
            "instanceId": "surface-main", "pluginId": "surface",
            "slotId": "layout-slot:root.children%5B0%5D.child",
            "rect": {"x": 0, "y": 0, "width": 280, "height": 600},
        }],
        "runtimeLayoutNodes": [{
            "nodeId": "layout-node:root", "type": "row",
            "rect": {"x": 0, "y": 0, "width": 1070, "height": 600},
            "trackWidths": [1070],
        }],
    }

    async def verify():
        return await CompositionOperationVerificationService(
            validation=_Validation(), runtime=_Runtime(runtime)
        ).verify(
            mutation_result={"appUIModel": {"afterHash": "c" * 64}},
            expected_runtime={"absentInstanceIds": ["history-main"]},
            expected_workspace_fill=expected_fill,
        )

    result = asyncio.run(verify())
    assert result.runtimeStatus == "failed"
    assert result.compositionVerified is True
    assert result.workspaceFillVerified is False

    runtime["runtimeInstances"][0]["rect"]["width"] = 1070
    passed = asyncio.run(verify())
    assert passed.runtimeStatus == "passed"
    assert passed.workspaceFillVerified is True


def test_runtime_plugin_slot_id_mirror_matches_encode_uri_component_rules():
    assert resolve_runtime_plugin_slot_id("composer-main", "actions") == "plugin:composer-main:actions"
    assert resolve_runtime_plugin_slot_id("composer main", "actions/x") == "plugin:composer%20main:actions%2Fx"
    assert resolve_runtime_plugin_slot_id("parent:é", "slot 空") == "plugin:parent%3A%C3%A9:slot%20%E7%A9%BA"
