from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from pathlib import Path

import pytest

from agent_ui_creator.project_control import ProjectControlClient, ProjectControlError


def _control_project(tmp_path: Path, source: str) -> tuple[Path, ProjectControlClient]:
    project_root = tmp_path / "project"
    entry = project_root / "scripts" / "ui-project-control.ts"
    runtime = project_root / "node_modules" / ".bin" / (
        "tsx.cmd" if os.name == "nt" else "tsx"
    )
    entry.parent.mkdir(parents=True)
    runtime.parent.mkdir(parents=True)
    entry.write_text(source, encoding="utf-8")
    os.symlink(sys.executable, runtime)
    return project_root, ProjectControlClient(project_root=project_root)


def _success(result: str = '{"foo":"bar"}') -> str:
    return (
        "import json\n"
        "import sys\n"
        "request = json.loads(sys.stdin.read())\n"
        f"print(json.dumps({{'schemaVersion': 3, 'ok': True, 'result': {result}}}))\n"
    )


def test_inspect_ui_project_returns_protocol_result(tmp_path):
    _root, client = _control_project(tmp_path, _success())

    assert asyncio.run(client.inspect_ui_project()) == {"foo": "bar"}
    assert client.metrics.to_dict()["byOperation"] == {"inspect_ui_project": 1}


def test_inspect_ui_project_sends_composition_view(tmp_path):
    source = """
import json
import sys
request = json.loads(sys.stdin.read())
print(json.dumps({"schemaVersion": 3, "ok": True, "result": request}))
"""
    _root, client = _control_project(tmp_path, source)

    result = asyncio.run(client.inspect_ui_project(view="composition"))

    assert result == {
        "schemaVersion": 3,
        "operation": "inspect_ui_project",
        "input": {"view": "composition"},
    }


def test_plugin_and_slot_methods_send_exact_versioned_requests(tmp_path):
    source = """
import json
import sys
request = json.loads(sys.stdin.read())
print(json.dumps({"schemaVersion": 3, "ok": True, "result": request}))
"""
    _root, client = _control_project(tmp_path, source)

    plugin = asyncio.run(client.inspect_ui_plugin("workspace-inspector"))
    services = asyncio.run(client.inspect_ui_services())
    layout_slots = asyncio.run(client.inspect_ui_slots(
        target={"type": "layout_slot", "slotRef": "l2"},
        app_ui_model_hash="a" * 64,
    ))
    plugin_slots = asyncio.run(client.inspect_ui_slots(
        target={
            "type": "plugin_slot",
            "parentInstanceId": "workspace",
            "slot": "content",
        },
    ))

    assert plugin == {
        "schemaVersion": 3,
        "operation": "inspect_ui_plugin",
        "input": {"pluginId": "workspace-inspector"},
    }
    assert layout_slots["input"] == {
        "appUIModelHash": "a" * 64,
        "target": {"type": "layout_slot", "slotRef": "l2"},
    }
    assert plugin_slots["input"] == {
        "target": {
            "type": "plugin_slot",
            "parentInstanceId": "workspace",
            "slot": "content",
        },
    }
    assert services == {
        "schemaVersion": 3,
        "operation": "inspect_ui_services",
        "input": {},
    }


def test_mutation_transport_sends_exact_protocol_v3_request(tmp_path):
    source = """
import json
import sys
request = json.loads(sys.stdin.read())
print(json.dumps({"schemaVersion": 3, "ok": True, "result": request}))
"""
    _root, client = _control_project(tmp_path, source)
    input = {
        "appUIModelHash": "a" * 64,
        "operations": [
            {
                "type": "set_plugin_enabled",
                "instanceId": "sample-main",
                "enabled": False,
            }
        ],
    }

    result = asyncio.run(client.request_app_ui_model_mutation(input))

    assert result == {
        "schemaVersion": 3,
        "operation": "mutate_app_ui_model",
        "input": input,
    }
    assert client.metrics.to_dict()["byOperation"] == {"mutate_app_ui_model": 1}


@pytest.mark.parametrize(
    "placement",
    [
        {
            "type": "relative",
            "anchorInstanceId": "conversation-main",
            "relation": "after",
        },
        {
            "type": "plugin_slot",
            "parentInstanceId": "composer-main",
            "slot": "actions",
        },
    ],
)
def test_mutation_transport_accepts_productized_plugin_move_placements(
    tmp_path, placement
):
    source = """
import json
import sys
request = json.loads(sys.stdin.read())
print(json.dumps({"schemaVersion": 3, "ok": True, "result": request}))
"""
    _root, client = _control_project(tmp_path, source)
    input = {
        "appUIModelHash": "a" * 64,
        "operations": [
            {
                "type": "move_plugin_to",
                "instanceId": "history-main",
                "placement": placement,
            }
        ],
    }

    assert asyncio.run(client.request_app_ui_model_mutation(input)) == {
        "schemaVersion": 3,
        "operation": "mutate_app_ui_model",
        "input": input,
    }


@pytest.mark.parametrize(
    "placement",
    [
        {
            "type": "relative",
            "anchorInstanceId": "conversation-main",
            "relation": "after",
            "anchorPluginId": "conversation-surface",
        },
        {
            "type": "plugin_slot",
            "parentInstanceId": "composer-main",
            "slot": "actions",
            "parentPluginId": "composer",
        },
        {
            "type": "relative",
            "anchorInstanceId": "conversation-main",
            "relation": "after",
            "layoutRef": "l2",
        },
        {
            "type": "relative",
            "anchorInstanceId": "conversation-main",
            "relation": "after",
            "index": 0,
        },
    ],
)
def test_mutation_transport_rejects_host_only_plugin_move_metadata(
    tmp_path, placement
):
    _root, client = _control_project(tmp_path, _success())
    input = {
        "appUIModelHash": "a" * 64,
        "operations": [
            {
                "type": "move_plugin_to",
                "instanceId": "history-main",
                "placement": placement,
            }
        ],
    }

    with pytest.raises(ProjectControlError) as raised:
        asyncio.run(client.request_app_ui_model_mutation(input))

    assert raised.value.code == "CONTROL_PROTOCOL_INCOMPATIBLE"


def test_agent_ui_source_methods_send_exact_versioned_requests(tmp_path):
    source = """
import json
import sys
request = json.loads(sys.stdin.read())
print(json.dumps({"schemaVersion": 3, "ok": True, "result": request}))
"""
    _root, client = _control_project(tmp_path, source)

    inspection = asyncio.run(client.inspect_agent_ui_sources())
    applied = asyncio.run(
        client.apply_agent_ui_source_item(
            item_id="primitive/dialog", expected_state_hash="a" * 64
        )
    )

    assert inspection["operation"] == "inspect_agent_ui_sources"
    assert applied == {
        "schemaVersion": 3,
        "operation": "apply_agent_ui_source_item",
        "input": {
            "itemId": "primitive/dialog",
            "expectedStateHash": "a" * 64,
        },
    }


def test_missing_entry_and_runtime_have_stable_codes(tmp_path):
    project_root = tmp_path / "project"
    project_root.mkdir()
    client = ProjectControlClient(project_root=project_root)

    with pytest.raises(ProjectControlError, match="entry is missing") as missing_entry:
        asyncio.run(client.inspect_ui_project())
    assert missing_entry.value.code == "CONTROL_ENTRY_MISSING"

    entry = project_root / "scripts" / "ui-project-control.ts"
    entry.parent.mkdir()
    entry.write_text("", encoding="utf-8")
    with pytest.raises(ProjectControlError) as missing_runtime:
        asyncio.run(client.inspect_ui_project())
    assert missing_runtime.value.code == "CONTROL_RUNTIME_MISSING"


def test_spawn_error_is_stable(tmp_path):
    project_root = tmp_path / "project"
    entry = project_root / "scripts" / "ui-project-control.ts"
    runtime = project_root / "node_modules" / ".bin" / (
        "tsx.cmd" if os.name == "nt" else "tsx"
    )
    entry.parent.mkdir(parents=True)
    runtime.parent.mkdir(parents=True)
    entry.write_text("", encoding="utf-8")
    runtime.write_text("not executable", encoding="utf-8")
    client = ProjectControlClient(project_root=project_root)

    with pytest.raises(ProjectControlError) as raised:
        asyncio.run(client.inspect_ui_project())
    assert raised.value.code == "CONTROL_ENTRY_SPAWN_FAILED"


def test_timeout_terminates_the_control_child(tmp_path):
    source = """
import os
import pathlib
import sys
import time
pathlib.Path(__file__).with_name("child.pid").write_text(str(os.getpid()))
sys.stdin.read()
time.sleep(60)
"""
    project_root, _client = _control_project(tmp_path, source)
    client = ProjectControlClient(project_root=project_root, timeout_seconds=0.05)

    with pytest.raises(ProjectControlError) as raised:
        asyncio.run(client.inspect_ui_project())
    assert raised.value.code == "CONTROL_ENTRY_TIMEOUT"

    pid = int((project_root / "scripts" / "child.pid").read_text())
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline:
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            break
        time.sleep(0.01)
    else:
        pytest.fail("timed-out ProjectControl child is still alive")


@pytest.mark.parametrize(
    ("source", "code"),
    [
        ("print('not json')\n", "CONTROL_PROTOCOL_INVALID_JSON"),
        (
            "import json\nprint(json.dumps({'schemaVersion': 2, 'ok': True, 'result': {}}))\n",
            "CONTROL_PROTOCOL_INCOMPATIBLE",
        ),
        (
            "import json\nprint(json.dumps({'schemaVersion': 3, 'ok': False, 'error': {'code': 'UI_PLUGIN_NOT_FOUND', 'message': 'missing'}}))\n",
            "UI_PLUGIN_NOT_FOUND",
        ),
        (
            "import json, sys\nprint(json.dumps({'schemaVersion': 3, 'ok': True, 'result': {}})); sys.exit(7)\n",
            "CONTROL_ENTRY_FAILED",
        ),
    ],
)
def test_protocol_and_target_errors_keep_stable_codes(tmp_path, source, code):
    _root, client = _control_project(tmp_path, source)

    with pytest.raises(ProjectControlError) as raised:
        asyncio.run(client.inspect_ui_project())
    assert raised.value.code == code


def test_combined_output_limit_terminates_the_child(tmp_path):
    source = """
import sys
sys.stdin.read()
sys.stdout.write("x" * 1024)
sys.stderr.write("y" * 1024)
"""
    project_root, _client = _control_project(tmp_path, source)
    client = ProjectControlClient(project_root=project_root, max_output_bytes=100)

    with pytest.raises(ProjectControlError) as raised:
        asyncio.run(client.inspect_ui_project())
    assert raised.value.code == "CONTROL_OUTPUT_TOO_LARGE"
