from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from pathlib import Path

import pytest

from agent_ui_creator.operator import OperatorClient, OperatorError, OPERATOR_ENTRY_PATH


def _operator_project(tmp_path: Path, source: str) -> tuple[Path, OperatorClient]:
    project_root = tmp_path / "project"
    entry = project_root / OPERATOR_ENTRY_PATH
    entry.parent.mkdir(parents=True, exist_ok=True)
    entry.write_text(source, encoding="utf-8")
    return project_root, OperatorClient(project_root=project_root, node_executable=sys.executable)


FIXTURE_ROOT = Path(__file__).resolve().parents[4] / "contracts/creator/fixtures/operator"


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
    return json.loads((root / OPERATOR_ENTRY_PATH).with_name("request.json").read_text())


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
    root, client = _operator_project(tmp_path, _echo())
    assert asyncio.run(getattr(client, method)(**kwargs)) == _fixture(operation)
    assert _captured(root) == {"operation": operation, "input": input}
    assert client.metrics.to_dict()["byOperation"] == {operation: 1}


@pytest.mark.parametrize("placement", [
    {"type": "relative", "anchorInstanceId": "conversation-main", "relation": "after"},
    {"type": "plugin_slot", "parentInstanceId": "composer-main", "slot": "actions"},
])
def test_mutation_transport_accepts_productized_plugin_move_placements(tmp_path, placement):
    root, client = _operator_project(tmp_path, _echo())
    input = {"appUIModelHash": "a" * 64, "operations": [{"type": "move_plugin_to", "instanceId": "history-main", "placement": placement}]}
    assert asyncio.run(client.request_app_ui_model_mutation(input)) == _fixture("mutate_app_ui_model")
    assert _captured(root) == {"operation": "mutate_app_ui_model", "input": input}


@pytest.mark.parametrize("extra", ["anchorPluginId", "parentPluginId", "layoutRef", "index"])
def test_mutation_transport_rejects_host_only_plugin_move_metadata(tmp_path, extra):
    _root, client = _operator_project(tmp_path, _success())
    input = {"appUIModelHash": "a" * 64, "operations": [{"type": "move_plugin_to", "instanceId": "history-main", "placement": {"type": "relative", "anchorInstanceId": "conversation-main", "relation": "after", extra: "invalid"}}]}
    with pytest.raises(OperatorError) as raised:
        asyncio.run(client.request_app_ui_model_mutation(input))
    assert raised.value.code == "OPERATOR_PROTOCOL_INCOMPATIBLE"


def test_missing_entry_and_runtime_have_stable_codes(tmp_path):
    project_root = tmp_path / "project"
    project_root.mkdir()
    client = OperatorClient(project_root=project_root)

    with pytest.raises(OperatorError, match="Missing") as missing_entry:
        asyncio.run(client.inspect_ui_project())
    assert missing_entry.value.code == "OPERATOR_ENTRY_MISSING"

    entry = project_root / OPERATOR_ENTRY_PATH
    entry.parent.mkdir(parents=True, exist_ok=True)
    entry.write_text("", encoding="utf-8")
    client._node_executable = None
    with pytest.raises(OperatorError) as missing_runtime:
        asyncio.run(client.inspect_ui_project())
    assert missing_runtime.value.code == "OPERATOR_RUNTIME_MISSING"


def test_spawn_error_is_stable(tmp_path):
    project_root = tmp_path / "project"
    entry = project_root / OPERATOR_ENTRY_PATH
    runtime = project_root / "node_modules" / ".bin" / (
        "tsx.cmd" if os.name == "nt" else "tsx"
    )
    entry.parent.mkdir(parents=True, exist_ok=True)
    runtime.parent.mkdir(parents=True)
    entry.write_text("", encoding="utf-8")
    runtime.write_text("not executable", encoding="utf-8")
    client = OperatorClient(project_root=project_root, node_executable=str(runtime))

    with pytest.raises(OperatorError) as raised:
        asyncio.run(client.inspect_ui_project())
    assert raised.value.code == "OPERATOR_ENTRY_SPAWN_FAILED"


def test_timeout_terminates_the_operator_child(tmp_path):
    source = """
import os
import pathlib
import sys
import time
pathlib.Path(__file__).with_name("child.pid").write_text(str(os.getpid()))
sys.stdin.read()
time.sleep(60)
"""
    project_root, _client = _operator_project(tmp_path, source)
    client = OperatorClient(project_root=project_root, timeout_seconds=0.3, node_executable=sys.executable)

    with pytest.raises(OperatorError) as raised:
        asyncio.run(client.inspect_ui_project())
    assert raised.value.code == "OPERATOR_ENTRY_TIMEOUT"

    pid = int(((project_root / OPERATOR_ENTRY_PATH).with_name("child.pid")).read_text())
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline:
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            break
        time.sleep(0.01)
    else:
        pytest.fail("timed-out Operator child is still alive")


def test_cancelling_a_waiting_operator_request_terminates_its_child(tmp_path):
    root, client = _operator_project(tmp_path, """
import os, pathlib, sys, time
pathlib.Path(__file__).with_name("child.pid").write_text(str(os.getpid()))
sys.stdin.read()
time.sleep(60)
""")
    pid_file = (root / OPERATOR_ENTRY_PATH).with_name("child.pid")
    terminated = []
    terminate = client._terminate

    async def record_termination(process):
        await terminate(process)
        terminated.append(process.returncode)
    client._terminate = record_termination

    async def cancel():
        task = asyncio.create_task(client.inspect_ui_project())
        for _ in range(200):
            if pid_file.exists():
                break
            await asyncio.sleep(0.01)
        assert pid_file.exists()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    asyncio.run(cancel())
    assert len(terminated) == 1
    assert terminated[0] is not None


@pytest.mark.parametrize(
    ("source", "code"),
    [
        ("print('not json')\n", "OPERATOR_PROTOCOL_INVALID_JSON"),
        (
            "import json\nprint(json.dumps({'ok': True, 'result': {}}))\n",
            "OPERATOR_PROTOCOL_INCOMPATIBLE",
        ),
        (
            "import json\nprint(json.dumps({'ok': False, 'error': {'code': 'UI_PLUGIN_NOT_FOUND', 'message': 'missing'}}))\n",
            "UI_PLUGIN_NOT_FOUND",
        ),
        (
            _success() + "import sys\nsys.exit(7)\n",
            "OPERATOR_ENTRY_FAILED",
        ),
    ],
)
def test_protocol_and_target_errors_keep_stable_codes(tmp_path, source, code):
    _root, client = _operator_project(tmp_path, source)

    with pytest.raises(OperatorError) as raised:
        asyncio.run(client.inspect_ui_project())
    assert raised.value.code == code


def test_combined_output_limit_terminates_the_child(tmp_path):
    source = """
import sys
sys.stdin.read()
sys.stdout.write("x" * 1024)
sys.stderr.write("y" * 1024)
"""
    project_root, _client = _operator_project(tmp_path, source)
    client = OperatorClient(project_root=project_root, max_output_bytes=100, node_executable=sys.executable)

    with pytest.raises(OperatorError) as raised:
        asyncio.run(client.inspect_ui_project())
    assert raised.value.code == "OPERATOR_OUTPUT_TOO_LARGE"


def test_managed_entry_uses_known_runtime_without_host_tsx(tmp_path):
    root = tmp_path / "fresh-user-host"
    entry = root / ".agent-ui/operator/entry.mjs"
    entry.parent.mkdir(parents=True, exist_ok=True)
    # Runtime injection exercises transport selection without depending on a local Node install.
    entry.write_text(_success(), encoding="utf-8")
    client = OperatorClient(project_root=root, node_executable=sys.executable)
    assert asyncio.run(client.inspect_ui_project()) == _fixture("inspect_ui_project")
    assert client.entry_path == entry
    assert client.executable_path == Path(sys.executable)
    assert not (root / "node_modules/.bin/tsx").exists()


def test_managed_entry_has_priority_over_legacy(tmp_path):
    root, _legacy = _operator_project(tmp_path, _success(repr({**_fixture("inspect_ui_project"), "mode": "embedded"})))
    entry = root / ".agent-ui/operator/entry.mjs"
    entry.parent.mkdir(parents=True, exist_ok=True)
    entry.write_text(_success(), encoding="utf-8")
    client = OperatorClient(project_root=root, node_executable=sys.executable)
    assert asyncio.run(client.inspect_ui_project())["mode"] == "assistant"


def test_broken_managed_runtime_does_not_fall_back_to_legacy(tmp_path):
    root, _legacy = _operator_project(tmp_path, _success())
    entry = root / ".agent-ui/operator/entry.mjs"
    entry.parent.mkdir(parents=True, exist_ok=True)
    entry.write_text(_success(), encoding="utf-8")
    client = OperatorClient(project_root=root, node_executable=str(root / "missing-node"))
    with pytest.raises(OperatorError) as failure:
        asyncio.run(client.inspect_ui_project())
    assert failure.value.code == "OPERATOR_RUNTIME_MISSING"


@pytest.mark.parametrize("intent,operation,input", [
    ("purge", "mutate_app_ui_model", {"operations": [{"type": "remove_plugin_default", "instanceId": "fixture"}]}),
    ("hide", "purge_ui_plugin", {"pluginId": "fixture"}),
    ("hide", "apply_agent_ui_source_item", {"itemId": "plugin/fixture"}),
    ("hide", "mutate_app_ui_model", {"operations": [{"type": "set_plugin_enabled", "instanceId": "fixture", "enabled": True}]}),
    ("uncertain", "synchronize_plugin_registry", {}),
])
def test_removal_authority_rejects_direct_transport_bypass(tmp_path, monkeypatch, intent, operation, input):
    from agent_ui_creator.removal_intent import RemovalIntentViolation, bind_removal_intent

    client = OperatorClient(project_root=tmp_path)
    monkeypatch.setattr(client, "_ensure_fixed_runtime", lambda: None)
    async def forbidden_execute(_request):
        pytest.fail("Forbidden removal mutation reached the Host transport")
    monkeypatch.setattr(client, "_execute", forbidden_execute)
    with bind_removal_intent(intent), pytest.raises(RemovalIntentViolation):
        asyncio.run(client._request(operation, input))


def test_project_queue_is_shared_across_clients_and_excludes_wait_from_timeout(tmp_path):
    root, first = _operator_project(tmp_path, _success())
    second = OperatorClient(project_root=root, node_executable=sys.executable, timeout_seconds=0.3)
    entered = asyncio.Event()
    release = asyncio.Event()
    original = first._execute
    async def slow(payload):
        entered.set()
        await release.wait()
        return await original(payload)
    first._execute = slow
    async def check():
        a = asyncio.create_task(first.inspect_ui_project())
        await entered.wait()
        b = asyncio.create_task(second.inspect_ui_project())
        await asyncio.sleep(0.5)
        assert not b.done()
        release.set()
        await asyncio.gather(a, b)
        assert second.metrics.queueWaitMs >= 450
    asyncio.run(check())


def test_cancelled_queue_waiter_does_not_spawn_or_block_successor(tmp_path):
    root, first = _operator_project(tmp_path, _success())
    second = OperatorClient(project_root=root, node_executable=sys.executable)
    entered, release = asyncio.Event(), asyncio.Event()
    original = first._execute
    async def slow(payload):
        entered.set()
        await release.wait()
        return await original(payload)
    first._execute = slow
    async def check():
        a = asyncio.create_task(first.inspect_ui_project())
        await entered.wait()
        b = asyncio.create_task(second.inspect_ui_project())
        await asyncio.sleep(0)
        b.cancel()
        with pytest.raises(asyncio.CancelledError):
            await b
        release.set()
        await a
        await second.inspect_ui_project()
    asyncio.run(check())


def test_admission_wait_does_not_consume_execution_budget(tmp_path):
    source = _success().replace("request = json.loads(sys.stdin.read())", '''request = json.loads(sys.stdin.read())
import time
time.sleep(0.15)
sys.stderr.write("AGENT_UI_OPERATOR_ADMITTED\\n")
sys.stderr.flush()
time.sleep(0.15)''')
    root, _ = _operator_project(tmp_path, source)
    client = OperatorClient(project_root=root, node_executable=sys.executable, timeout_seconds=0.25)
    asyncio.run(client.inspect_ui_project())


def test_cancelled_child_tickets_are_released_without_touching_other_owners(tmp_path):
    source = '''import json, os, pathlib, sys, time
sys.stdin.read()
pid = os.getpid()
directory = pathlib.Path('.agentuicreator/control/operator-locks')
directory.mkdir(parents=True, exist_ok=True)
token = '00000000-0000-0000-0000-000000000000'
(directory / f'{pid}.{token}.json').write_text(json.dumps({'pid':pid,'token':token,'number':1}))
pathlib.Path('ready').write_text(str(pid))
time.sleep(60)
'''
    root, client = _operator_project(tmp_path, source)
    directory = root / '.agentuicreator/control/operator-locks'
    directory.mkdir(parents=True)
    other = directory / '999.keep.json'
    other.write_text('{}')
    async def check():
        task = asyncio.create_task(client.inspect_ui_project())
        for _ in range(200):
            if (root / 'ready').exists():
                break
            await asyncio.sleep(0.01)
        assert (root / 'ready').exists()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert list(directory.iterdir()) == [other]
    asyncio.run(check())


def test_another_project_is_not_blocked_by_queue(tmp_path):
    root, first = _operator_project(tmp_path / 'a', _success())
    _, other = _operator_project(tmp_path / 'b', _success())
    entered, release = asyncio.Event(), asyncio.Event()
    original = first._execute
    async def slow(payload):
        entered.set()
        await release.wait()
        return await original(payload)
    first._execute = slow
    async def check():
        a = asyncio.create_task(first.inspect_ui_project())
        await entered.wait()
        await other.inspect_ui_project()
        assert not a.done()
        release.set()
        await a
    asyncio.run(check())


def test_invalid_shared_module_reports_exact_field_before_process_start(tmp_path):
    client=OperatorClient(project_root=tmp_path)
    with pytest.raises(OperatorError) as failure:
        client._validate_protocol({"operation":"inspect_ui_plugin","input":{"pluginId":"custom","sharedModule":"/"}},request=True)
    assert failure.value.code == "OPERATOR_PROTOCOL_INCOMPATIBLE"
    assert failure.value.details["field"] == "input.sharedModule"
    assert failure.value.details["constraint"] == "pattern"
