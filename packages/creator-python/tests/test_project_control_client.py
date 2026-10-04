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


FIXTURE_ROOT = Path(__file__).resolve().parents[3] / "contracts/creator/fixtures/project-control"


def _fixture(operation):
    return json.loads((FIXTURE_ROOT / f"{operation}.result.json").read_text())


def _success(result: str | None = None) -> str:
    result = result or repr(_fixture("inspect_ui_project"))
    return (
        "import json\n"
        "import sys\n"
        "request = json.loads(sys.stdin.read())\n"
        f"print(json.dumps({{'ok': True, 'result': {result}}}))\n"
    )


def _echo():
    manifest = json.loads((FIXTURE_ROOT / "manifest.json").read_text())
    results = {entry["operation"]: _fixture(entry["operation"]) for entry in manifest["results"] if entry["valid"] and entry["file"] != "composition.result.json"}
    return (
        "import json, sys, pathlib\n"
        "request = json.loads(sys.stdin.read())\n"
        "pathlib.Path(__file__).with_name('request.json').write_text(json.dumps(request))\n"
        f"results = {results!r}\n"
        "print(json.dumps({'ok': True, 'result': results[request['operation']]}))\n"
    )


def _captured(root):
    return json.loads((root / "scripts/request.json").read_text())


@pytest.mark.parametrize("operation,input,method,kwargs", [
    ("inspect_ui_project", {}, "inspect_ui_project", {}),
    ("inspect_ui_project", {"view": "composition"}, "inspect_ui_project", {"view": "composition"}),
    ("inspect_app_ui_model", {}, "inspect_app_ui_model", {}),
    ("list_ui_plugins", {}, "list_ui_plugins", {}),
    ("inspect_ui_services", {}, "inspect_ui_services", {}),
    ("inspect_ui_plugin", {"pluginId": "fixture"}, "inspect_ui_plugin", {"plugin_id": "fixture"}),
    ("inspect_ui_plugin_source_references", {"pluginId": "fixture"}, "inspect_ui_plugin_source_references", {"plugin_id": "fixture"}),
    ("inspect_ui_slots", {}, "inspect_ui_slots", {}),
    ("inspect_agent_ui_sources", {}, "inspect_agent_ui_sources", {}),
    ("apply_agent_ui_source_item", {"itemId": "primitive/tooltip", "expectedStateHash": "a" * 64}, "apply_agent_ui_source_item", {"item_id": "primitive/tooltip", "expected_state_hash": "a" * 64}),
    ("remove_agent_ui_source_items", {"itemIds": ["primitive/tooltip"], "expectedStateHash": "a" * 64}, "remove_agent_ui_source_items", {"item_ids": ["primitive/tooltip"], "expected_state_hash": "a" * 64}),
])
def test_transport_sends_exact_requests_and_validates_result(tmp_path, operation, input, method, kwargs):
    root, client = _control_project(tmp_path, _echo())
    assert asyncio.run(getattr(client, method)(**kwargs)) == _fixture(operation)
    assert _captured(root) == {"operation": operation, "input": input}
    assert client.metrics.to_dict()["byOperation"] == {operation: 1}


@pytest.mark.parametrize("placement", [
    {"type": "relative", "anchorInstanceId": "conversation-main", "relation": "after"},
    {"type": "plugin_slot", "parentInstanceId": "composer-main", "slot": "actions"},
])
def test_mutation_transport_accepts_productized_plugin_move_placements(tmp_path, placement):
    root, client = _control_project(tmp_path, _echo())
    input = {"appUIModelHash": "a" * 64, "operations": [{"type": "move_plugin_to", "instanceId": "history-main", "placement": placement}]}
    assert asyncio.run(client.request_app_ui_model_mutation(input)) == _fixture("mutate_app_ui_model")
    assert _captured(root) == {"operation": "mutate_app_ui_model", "input": input}


@pytest.mark.parametrize("extra", ["anchorPluginId", "parentPluginId", "layoutRef", "index"])
def test_mutation_transport_rejects_host_only_plugin_move_metadata(tmp_path, extra):
    _root, client = _control_project(tmp_path, _success())
    input = {"appUIModelHash": "a" * 64, "operations": [{"type": "move_plugin_to", "instanceId": "history-main", "placement": {"type": "relative", "anchorInstanceId": "conversation-main", "relation": "after", extra: "invalid"}}]}
    with pytest.raises(ProjectControlError) as raised:
        asyncio.run(client.request_app_ui_model_mutation(input))
    assert raised.value.code == "CONTROL_PROTOCOL_INCOMPATIBLE"


def test_missing_entry_and_runtime_have_stable_codes(tmp_path):
    project_root = tmp_path / "project"
    project_root.mkdir()
    client = ProjectControlClient(project_root=project_root)

    with pytest.raises(ProjectControlError, match="Neither") as missing_entry:
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
            "import json\nprint(json.dumps({'ok': True, 'result': {}}))\n",
            "CONTROL_PROTOCOL_INCOMPATIBLE",
        ),
        (
            "import json\nprint(json.dumps({'ok': False, 'error': {'code': 'UI_PLUGIN_NOT_FOUND', 'message': 'missing'}}))\n",
            "UI_PLUGIN_NOT_FOUND",
        ),
        (
            "import json, sys\nprint(json.dumps({'ok': True, 'result': {}})); sys.exit(7)\n",
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


def test_managed_entry_uses_known_runtime_without_host_tsx(tmp_path):
    root = tmp_path / "fresh-user-host"
    entry = root / ".agent-ui/control/project-control.mjs"
    entry.parent.mkdir(parents=True)
    # Runtime injection exercises transport selection without depending on a local Node install.
    entry.write_text(_success(), encoding="utf-8")
    client = ProjectControlClient(project_root=root, node_executable=sys.executable)
    assert asyncio.run(client.inspect_ui_project()) == _fixture("inspect_ui_project")
    assert client.entry_path == entry
    assert client.executable_path == Path(sys.executable)
    assert not (root / "node_modules/.bin/tsx").exists()


def test_managed_entry_has_priority_over_legacy(tmp_path):
    root, _legacy = _control_project(tmp_path, _success(repr({**_fixture("inspect_ui_project"), "mode": "embedded"})))
    entry = root / ".agent-ui/control/project-control.mjs"
    entry.parent.mkdir(parents=True)
    entry.write_text(_success(), encoding="utf-8")
    client = ProjectControlClient(project_root=root, node_executable=sys.executable)
    assert asyncio.run(client.inspect_ui_project())["mode"] == "assistant"


def test_broken_managed_runtime_does_not_fall_back_to_legacy(tmp_path):
    root, _legacy = _control_project(tmp_path, _success())
    entry = root / ".agent-ui/control/project-control.mjs"
    entry.parent.mkdir(parents=True)
    entry.write_text(_success(), encoding="utf-8")
    client = ProjectControlClient(project_root=root, node_executable=str(root / "missing-node"))
    with pytest.raises(ProjectControlError) as failure:
        asyncio.run(client.inspect_ui_project())
    assert failure.value.code == "CONTROL_RUNTIME_MISSING"
