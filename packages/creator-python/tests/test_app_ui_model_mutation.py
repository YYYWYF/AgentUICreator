from __future__ import annotations

import asyncio
import copy
import json
from pathlib import Path

import pytest

from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.app_ui_model import (
    APP_UI_MODEL_PATH,
    REGISTRY_PATH,
    AppUIModelMutationError,
    AppUIModelMutationService,
    ProjectMutationCoordinator,
    MAX_MUTATION_RESULT_CHARACTERS,
)
from agent_ui_creator.app_ui_model.mutation_tool import (
    APP_UI_MODEL_MUTATION_TOOL_SCHEMA,
    create_app_ui_model_mutation_tool,
    load_app_ui_model_mutation_tool_schema,
)
from agent_ui_creator.files import creator_content_hash, read_creator_file_state
from agent_ui_creator.domain_state import DomainObservationContext
from agent_ui_creator.domain_tools import create_project_control_tools
from agent_ui_creator.project_control import ProjectControlError
from agent_ui_creator.model_protocol import ToolProtocolGuard, ToolProtocolMetrics
from agent_ui_creator.transactions import CreatorTransactionError
from langchain.agents.middleware import ModelResponse
from langchain_core.messages import AIMessage


def _create_project(tmp_path: Path) -> Path:
    root = tmp_path / "project"
    (root / "app-ui").mkdir(parents=True)
    (root / "plugins").mkdir()
    (root / APP_UI_MODEL_PATH).write_text(
        '{"version":"2","title":"Before"}\n', encoding="utf-8"
    )
    (root / REGISTRY_PATH).write_text("export const plugins = [];\n", encoding="utf-8")
    return root


def _result(root: Path, before_hash: str, changed_paths: list[str]) -> dict:
    return {
        "schemaVersion": 1,
        "transactionId": "transaction-1",
        "changed": bool(changed_paths),
        "changedPaths": changed_paths,
        "appUIModel": {
            "beforeHash": before_hash,
            "afterHash": read_creator_file_state(root, APP_UI_MODEL_PATH).hash,
        },
        "snapshotToken": {
            "appUIModelHash": read_creator_file_state(root, APP_UI_MODEL_PATH).hash,
            "registryHash": read_creator_file_state(root, REGISTRY_PATH).hash,
        },
    }


class FakeMutationClient:
    def __init__(self, root: Path, *, changed_paths=(), reported_paths=None, result=None):
        self.root = root
        self.changed_paths = tuple(changed_paths)
        self.reported_paths = reported_paths
        self.result = result
        self.calls = 0
        self.inputs = []

    async def request_app_ui_model_mutation(self, input):
        self.calls += 1
        self.inputs.append(copy.deepcopy(input))
        before_hash = read_creator_file_state(self.root, APP_UI_MODEL_PATH).hash
        for path in self.changed_paths:
            target = self.root / path
            target.write_text(target.read_text(encoding="utf-8") + f"// change {self.calls}\n", encoding="utf-8")
        if self.result is not None:
            return copy.deepcopy(self.result)
        reported = list(self.changed_paths if self.reported_paths is None else self.reported_paths)
        return _result(self.root, before_hash, reported)


def _service(root: Path, client, *, coordinator=None, run_id="run-1"):
    activity = CreatorActivityRecorder(root)
    activity.begin(run_id)
    return (
        AppUIModelMutationService(
            project_root=root,
            project_control=client,
            activity=activity,
            mutation_coordinator=coordinator or ProjectMutationCoordinator(),
        ),
        activity,
    )


def _mutate(service, app_hash):
    return asyncio.run(
        service.mutate(
            app_ui_model_hash=app_hash,
            operations=[
                {
                    "type": "set_instance_enabled",
                    "instanceId": "sample-main",
                    "enabled": False,
                }
            ],
        )
    )


def _observations(service, app_hash):
    observations = DomainObservationContext()
    observations.observe_app_ui_model(
        hash=app_hash,
        revision=service.activity.revision,
        source="inspect_app_ui_model",
    )
    return observations


def test_single_path_mutation_advances_one_revision_and_is_undoable(tmp_path):
    root = _create_project(tmp_path)
    before = (root / APP_UI_MODEL_PATH).read_text(encoding="utf-8")
    client = FakeMutationClient(root, changed_paths=(APP_UI_MODEL_PATH,))
    service, activity = _service(root, client)

    result = _mutate(service, creator_content_hash(before))
    receipt = activity.finish()

    assert result.mutation_revision == 1
    assert result.to_dict()["mutationRevision"] == 1
    assert [file["path"] for file in receipt["files"]] == [APP_UI_MODEL_PATH]
    assert receipt["verification"]["status"] == "not-run"
    assert receipt["transaction"] == {"runId": "run-1", "undoable": True}
    activity.transactions.undo("run-1")
    assert (root / APP_UI_MODEL_PATH).read_text(encoding="utf-8") == before


def test_two_path_mutation_advances_by_real_file_count_and_undoes_both(tmp_path):
    root = _create_project(tmp_path)
    before_app = (root / APP_UI_MODEL_PATH).read_text(encoding="utf-8")
    before_registry = (root / REGISTRY_PATH).read_text(encoding="utf-8")
    client = FakeMutationClient(root, changed_paths=(APP_UI_MODEL_PATH, REGISTRY_PATH))
    service, activity = _service(root, client)

    result = _mutate(service, creator_content_hash(before_app))
    receipt = activity.finish()

    assert result.mutation_revision == 2
    assert [file["path"] for file in receipt["files"]] == [
        APP_UI_MODEL_PATH,
        REGISTRY_PATH,
    ]
    activity.transactions.undo("run-1")
    assert (root / APP_UI_MODEL_PATH).read_text(encoding="utf-8") == before_app
    assert (root / REGISTRY_PATH).read_text(encoding="utf-8") == before_registry


def test_noop_does_not_advance_revision_or_create_transaction(tmp_path):
    root = _create_project(tmp_path)
    app_hash = read_creator_file_state(root, APP_UI_MODEL_PATH).hash
    service, activity = _service(root, FakeMutationClient(root))

    result = _mutate(service, app_hash)

    assert result.mutation_revision == 0
    assert activity.finish()["files"] == []
    assert "transaction" not in activity.finish()


@pytest.mark.parametrize(
    ("mutator", "expected_code"),
    [
        (lambda value: value.pop("changedPaths"), "APP_UI_MODEL_CHANGED_PATH_INVALID"),
        (lambda value: value.update(changedPaths="app-ui/app-ui.json"), "APP_UI_MODEL_CHANGED_PATH_INVALID"),
        (lambda value: value.update(changedPaths=["package.json"]), "APP_UI_MODEL_CHANGED_PATH_INVALID"),
        (lambda value: value["appUIModel"].update(beforeHash="b" * 64), "APP_UI_MODEL_MUTATION_RESULT_INCONSISTENT"),
        (lambda value: value["appUIModel"].update(afterHash="bad"), "APP_UI_MODEL_MUTATION_RESULT_INCONSISTENT"),
        (lambda value: value["snapshotToken"].update(appUIModelHash="c" * 64), "APP_UI_MODEL_MUTATION_RESULT_INCONSISTENT"),
    ],
)
def test_result_parser_fails_closed(tmp_path, mutator, expected_code):
    root = _create_project(tmp_path)
    app_hash = read_creator_file_state(root, APP_UI_MODEL_PATH).hash
    malformed = _result(root, app_hash, [])
    mutator(malformed)
    service, activity = _service(root, FakeMutationClient(root, result=malformed))

    with pytest.raises(AppUIModelMutationError) as raised:
        _mutate(service, app_hash)

    assert raised.value.code == expected_code
    assert activity.revision == 0


@pytest.mark.parametrize(
    ("actual", "reported"),
    [
        ((APP_UI_MODEL_PATH, REGISTRY_PATH), (APP_UI_MODEL_PATH,)),
        ((APP_UI_MODEL_PATH,), (APP_UI_MODEL_PATH, REGISTRY_PATH)),
    ],
)
def test_changed_path_mismatch_touches_only_real_disk_changes(tmp_path, actual, reported):
    root = _create_project(tmp_path)
    app_hash = read_creator_file_state(root, APP_UI_MODEL_PATH).hash
    service, activity = _service(
        root,
        FakeMutationClient(root, changed_paths=actual, reported_paths=reported),
    )

    with pytest.raises(AppUIModelMutationError) as raised:
        _mutate(service, app_hash)

    assert raised.value.code == "APP_UI_MODEL_CHANGED_PATHS_MISMATCH"
    assert activity.revision == len(actual)
    assert [file["path"] for file in activity.finish()["files"]] == sorted(actual)


def test_malformed_post_response_still_records_real_mutation(tmp_path):
    root = _create_project(tmp_path)
    app_hash = read_creator_file_state(root, APP_UI_MODEL_PATH).hash
    service, activity = _service(
        root,
        FakeMutationClient(
            root,
            changed_paths=(APP_UI_MODEL_PATH,),
            result={"schemaVersion": 1},
        ),
        run_id="malformed-run",
    )

    with pytest.raises(AppUIModelMutationError):
        _mutate(service, app_hash)

    receipt = activity.finish()
    assert activity.revision == 1
    assert receipt["files"][0]["path"] == APP_UI_MODEL_PATH
    assert receipt["transaction"]["undoable"] is True
    activity.transactions.undo("malformed-run")
    assert read_creator_file_state(root, APP_UI_MODEL_PATH).hash == app_hash


def test_hash_conflict_is_not_retried_and_does_not_touch_activity(tmp_path):
    root = _create_project(tmp_path)

    class ConflictClient:
        calls = 0

        async def request_app_ui_model_mutation(self, _input):
            self.calls += 1
            raise ProjectControlError(
                "APP_UI_MODEL_HASH_CONFLICT",
                "stale",
                {"expectedHash": "a" * 64, "actualHash": "b" * 64},
            )

    client = ConflictClient()
    service, activity = _service(root, client)

    with pytest.raises(AppUIModelMutationError) as raised:
        _mutate(service, "a" * 64)

    assert raised.value.code == "APP_UI_MODEL_HASH_CONFLICT"
    assert client.calls == 1
    assert activity.revision == 0
    assert activity.finish()["files"] == []


def test_third_identical_failed_signature_is_refused_without_target_call(tmp_path):
    root = _create_project(tmp_path)

    class InvalidClient:
        calls = 0

        async def request_app_ui_model_mutation(self, _input):
            self.calls += 1
            raise ProjectControlError("APP_UI_MODEL_OPERATION_INVALID", "invalid")

    client = InvalidClient()
    service, _activity = _service(root, client)
    for _ in range(2):
        with pytest.raises(AppUIModelMutationError):
            _mutate(service, "a" * 64)

    with pytest.raises(AppUIModelMutationError) as raised:
        _mutate(service, "a" * 64)

    assert raised.value.code == "AGENT_NO_PROGRESS"
    assert client.calls == 2


def test_capture_budget_failure_happens_before_target_call(tmp_path, monkeypatch):
    root = _create_project(tmp_path)
    client = FakeMutationClient(root)
    service, activity = _service(root, client)
    original_capture = activity.capture_before

    def fail_on_registry(path):
        if path == REGISTRY_PATH:
            raise CreatorTransactionError("CREATOR_TRANSACTION_TOO_LARGE", "budget")
        original_capture(path)

    monkeypatch.setattr(activity, "capture_before", fail_on_registry)

    with pytest.raises(CreatorTransactionError):
        _mutate(service, read_creator_file_state(root, APP_UI_MODEL_PATH).hash)
    assert client.calls == 0


def test_same_hash_concurrent_mutations_serialize_and_only_one_commits(tmp_path):
    root = _create_project(tmp_path)
    initial_hash = read_creator_file_state(root, APP_UI_MODEL_PATH).hash
    coordinator = ProjectMutationCoordinator()

    class CasClient:
        def __init__(self):
            self.calls = 0
            self.active = 0
            self.maximum_active = 0

        async def request_app_ui_model_mutation(self, input):
            self.calls += 1
            self.active += 1
            self.maximum_active = max(self.maximum_active, self.active)
            try:
                await asyncio.sleep(0.01)
                before_hash = read_creator_file_state(root, APP_UI_MODEL_PATH).hash
                if before_hash != input["appUIModelHash"]:
                    raise ProjectControlError("APP_UI_MODEL_HASH_CONFLICT", "stale")
                path = root / APP_UI_MODEL_PATH
                path.write_text(path.read_text(encoding="utf-8") + "// committed\n", encoding="utf-8")
                return _result(root, before_hash, [APP_UI_MODEL_PATH])
            finally:
                self.active -= 1

    client = CasClient()
    service_a, _activity_a = _service(root, client, coordinator=coordinator, run_id="a")
    service_b, activity_b = _service(root, client, coordinator=coordinator, run_id="b")

    async def run_both():
        return await asyncio.gather(
            service_a.mutate(app_ui_model_hash=initial_hash, operations=[{"type": "remove_instance", "instanceId": "a"}]),
            service_b.mutate(app_ui_model_hash=initial_hash, operations=[{"type": "remove_instance", "instanceId": "b"}]),
            return_exceptions=True,
        )

    settled = asyncio.run(run_both())

    assert sum(isinstance(item, AppUIModelMutationError) for item in settled) == 1
    assert client.calls == 2
    assert client.maximum_active == 1
    assert activity_b.revision == 0


def test_coordinator_allows_different_project_roots_to_run_independently(tmp_path):
    coordinator = ProjectMutationCoordinator()
    roots = [tmp_path / "a", tmp_path / "b"]
    for root in roots:
        root.mkdir()
    active = 0
    maximum_active = 0

    async def task(root):
        nonlocal active, maximum_active
        async with coordinator.transaction(root):
            active += 1
            maximum_active = max(maximum_active, active)
            await asyncio.sleep(0.01)
            active -= 1

    async def run_tasks():
        await asyncio.gather(*(task(root) for root in roots))

    asyncio.run(run_tasks())
    assert maximum_active == 2


def test_tool_schema_is_sourced_from_operation_contract_and_tool_errors_are_structured(tmp_path):
    root = _create_project(tmp_path)
    contract = json.loads(
        (Path(__file__).resolve().parents[3] / "contracts" / "creator" / "app-ui-model-operation.schema.json").read_text(encoding="utf-8")
    )
    schema = load_app_ui_model_mutation_tool_schema()
    assert schema == APP_UI_MODEL_MUTATION_TOOL_SCHEMA
    assert schema["properties"]["operations"]["items"]["oneOf"] == contract["oneOf"]
    assert schema["$defs"] == contract["$defs"]
    assert schema["required"] == ["operations"]
    assert schema["additionalProperties"] is False

    service, _activity = _service(root, FakeMutationClient(root, result={"bad": True}))
    app_hash = read_creator_file_state(root, APP_UI_MODEL_PATH).hash
    tool = create_app_ui_model_mutation_tool(service, _observations(service, app_hash))
    output = asyncio.run(
        tool.ainvoke(
            {
                "appUIModelHash": app_hash,
                "operations": [{"type": "remove_instance", "instanceId": "sample-main"}],
            }
        )
    )
    assert json.loads(output)["error"]["code"] == "APP_UI_MODEL_MUTATION_RESULT_INCONSISTENT"


def test_tool_replaces_oversized_success_with_bounded_error(tmp_path):
    root = _create_project(tmp_path)
    app_hash = read_creator_file_state(root, APP_UI_MODEL_PATH).hash
    huge_result = _result(root, app_hash, [])
    huge_result["diff"] = "x" * MAX_MUTATION_RESULT_CHARACTERS
    service, _activity = _service(root, FakeMutationClient(root, result=huge_result))
    tool = create_app_ui_model_mutation_tool(service, _observations(service, app_hash))

    output = asyncio.run(
        tool.ainvoke(
            {
                "appUIModelHash": app_hash,
                "operations": [
                    {
                        "type": "set_instance_enabled",
                        "instanceId": "sample-main",
                        "enabled": True,
                    }
                ],
            }
        )
    )

    assert len(output) < MAX_MUTATION_RESULT_CHARACTERS
    assert json.loads(output)["error"]["code"] == "APP_UI_MODEL_MUTATION_RESULT_TOO_LARGE"


def test_tool_protocol_guard_validates_mutation_against_formal_schema(tmp_path):
    root = _create_project(tmp_path)
    service, _activity = _service(root, FakeMutationClient(root))
    tool = create_app_ui_model_mutation_tool(service, _observations(service, "a" * 64))
    decision = ToolProtocolGuard(ToolProtocolMetrics()).inspect(
        ModelResponse(
            result=[
                AIMessage(
                    content="",
                    tool_calls=[
                        {
                            "name": "mutate_app_ui_model",
                            "args": {
                                "appUIModelHash": "not-a-hash",
                                "operations": [],
                            },
                            "id": "bad-mutation",
                        }
                    ],
                )
            ]
        ),
        [tool],
    )

    assert decision.status == "repair"


def test_tool_protocol_guard_accepts_operations_without_hash(tmp_path):
    root = _create_project(tmp_path)
    service, _activity = _service(root, FakeMutationClient(root))
    app_hash = read_creator_file_state(root, APP_UI_MODEL_PATH).hash
    tool = create_app_ui_model_mutation_tool(service, _observations(service, app_hash))
    decision = ToolProtocolGuard(ToolProtocolMetrics()).inspect(
        ModelResponse(
            result=[
                AIMessage(
                    content="",
                    tool_calls=[
                        {
                            "name": "mutate_app_ui_model",
                            "args": {
                                "operations": [
                                    {"type": "remove_instance", "instanceId": "sample-main"}
                                ]
                            },
                            "id": "host-hash-mutation",
                        }
                    ],
                )
            ]
        ),
        [tool],
    )

    assert decision.status == "tool_call"


def test_tool_protocol_guard_rejects_missing_operations(tmp_path):
    root = _create_project(tmp_path)
    service, _activity = _service(root, FakeMutationClient(root))
    tool = create_app_ui_model_mutation_tool(
        service, _observations(service, "a" * 64)
    )
    decision = ToolProtocolGuard(ToolProtocolMetrics()).inspect(
        ModelResponse(
            result=[
                AIMessage(
                    content="",
                    tool_calls=[
                        {
                            "name": "mutate_app_ui_model",
                            "args": {"appUIModelHash": "a" * 64},
                            "id": "missing-operations",
                        }
                    ],
                )
            ]
        ),
        [tool],
    )

    assert decision.status == "repair"


def test_mutation_without_observation_fails_before_target_call(tmp_path):
    root = _create_project(tmp_path)
    client = FakeMutationClient(root)
    service, _activity = _service(root, client)
    tool = create_app_ui_model_mutation_tool(service, DomainObservationContext())

    output = asyncio.run(
        tool.ainvoke(
            {
                "operations": [
                    {"type": "remove_instance", "instanceId": "sample-main"}
                ]
            }
        )
    )

    assert json.loads(output)["error"]["code"] == "APP_UI_MODEL_OBSERVATION_REQUIRED"
    assert client.calls == 0
    assert service.metrics.requests == 1
    assert service.metrics.operationsPerMutation == [1]
    assert service.metrics.successfulRequests == 0


def test_explicit_hash_must_match_host_observation(tmp_path):
    root = _create_project(tmp_path)
    client = FakeMutationClient(root)
    service, _activity = _service(root, client)
    observations = _observations(service, "a" * 64)
    tool = create_app_ui_model_mutation_tool(service, observations)

    output = asyncio.run(
        tool.ainvoke(
            {
                "appUIModelHash": "b" * 64,
                "operations": [
                    {"type": "remove_instance", "instanceId": "sample-main"}
                ],
            }
        )
    )

    assert json.loads(output)["error"]["code"] == (
        "APP_UI_MODEL_OBSERVATION_HASH_MISMATCH"
    )
    assert client.calls == 0
    assert observations.current_hash(current_revision=0) == "a" * 64
    assert observations.metrics.explicitHashMismatches == 1
    assert service.metrics.requests == 1
    assert service.metrics.successfulRequests == 0


def test_matching_explicit_hash_is_accepted_but_host_remains_authority(tmp_path):
    root = _create_project(tmp_path)
    client = FakeMutationClient(root)
    service, _activity = _service(root, client)
    app_hash = read_creator_file_state(root, APP_UI_MODEL_PATH).hash
    observations = _observations(service, app_hash)
    tool = create_app_ui_model_mutation_tool(service, observations)

    output = json.loads(
        asyncio.run(
            tool.ainvoke(
                {
                    "appUIModelHash": app_hash,
                    "operations": [
                        {"type": "remove_instance", "instanceId": "sample-main"}
                    ],
                }
            )
        )
    )

    assert output["ok"] is True
    assert client.inputs[0]["appUIModelHash"] == app_hash
    assert observations.metrics.explicitHashMatches == 1


def test_stale_activity_revision_requires_new_observation(tmp_path):
    root = _create_project(tmp_path)
    client = FakeMutationClient(root)
    service, activity = _service(root, client)
    app_hash = read_creator_file_state(root, APP_UI_MODEL_PATH).hash
    observations = _observations(service, app_hash)
    activity.touch("plugins/source.ts")
    tool = create_app_ui_model_mutation_tool(service, observations)

    output = asyncio.run(
        tool.ainvoke(
            {
                "operations": [
                    {"type": "remove_instance", "instanceId": "sample-main"}
                ]
            }
        )
    )

    error = json.loads(output)["error"]
    assert error["code"] == "APP_UI_MODEL_OBSERVATION_REQUIRED"
    assert error["details"] == {"currentRevision": 1, "observedRevision": 0}
    assert client.calls == 0


def test_success_advances_observation_and_second_mutation_reuses_after_hash(tmp_path):
    root = _create_project(tmp_path)
    client = FakeMutationClient(root, changed_paths=(APP_UI_MODEL_PATH,))
    service, _activity = _service(root, client)
    initial_hash = read_creator_file_state(root, APP_UI_MODEL_PATH).hash
    observations = _observations(service, initial_hash)
    tool = create_app_ui_model_mutation_tool(service, observations)
    arguments = {
        "operations": [
            {
                "type": "set_instance_enabled",
                "instanceId": "sample-main",
                "enabled": False,
            }
        ]
    }

    first = json.loads(asyncio.run(tool.ainvoke(arguments)))
    first_after_hash = first["result"]["appUIModel"]["afterHash"]
    second = json.loads(asyncio.run(tool.ainvoke(arguments)))

    assert first["ok"] is True
    assert second["ok"] is True
    assert client.calls == 2
    assert client.inputs[0]["appUIModelHash"] == initial_hash
    assert client.inputs[1]["appUIModelHash"] == first_after_hash
    assert observations.snapshot()["appUIModel"] == {
        "hash": second["result"]["appUIModel"]["afterHash"],
        "revision": 2,
        "source": "mutation_result",
    }
    assert observations.metrics.hashReuses == 2


def test_mutation_error_invalidates_observation_until_new_inspection(tmp_path):
    root = _create_project(tmp_path)

    class ConflictClient:
        def __init__(self):
            self.calls = 0

        async def request_app_ui_model_mutation(self, _input):
            self.calls += 1
            raise ProjectControlError("APP_UI_MODEL_HASH_CONFLICT", "stale")

    client = ConflictClient()
    service, _activity = _service(root, client)
    observations = _observations(service, "a" * 64)
    tool = create_app_ui_model_mutation_tool(service, observations)
    arguments = {
        "operations": [
            {"type": "remove_instance", "instanceId": "sample-main"}
        ]
    }

    first = json.loads(asyncio.run(tool.ainvoke(arguments)))
    second = json.loads(asyncio.run(tool.ainvoke(arguments)))

    assert first["error"]["code"] == "APP_UI_MODEL_HASH_CONFLICT"
    assert second["error"]["code"] == "APP_UI_MODEL_OBSERVATION_REQUIRED"
    assert client.calls == 1
    assert observations.metrics.invalidations == 1


def test_conflict_then_inspect_allows_retry_with_new_host_hash(tmp_path):
    root = _create_project(tmp_path)
    initial_hash = read_creator_file_state(root, APP_UI_MODEL_PATH).hash

    class ConflictThenSuccessClient:
        def __init__(self):
            self.calls = 0
            self.inputs = []

        async def inspect_app_ui_model(self):
            return {
                "schemaVersion": 2,
                "hash": read_creator_file_state(root, APP_UI_MODEL_PATH).hash,
                "model": {},
            }

        async def request_app_ui_model_mutation(self, input):
            self.calls += 1
            self.inputs.append(copy.deepcopy(input))
            current_hash = read_creator_file_state(root, APP_UI_MODEL_PATH).hash
            if input["appUIModelHash"] != current_hash:
                raise ProjectControlError("APP_UI_MODEL_HASH_CONFLICT", "stale")
            return _result(root, current_hash, [])

        async def inspect_ui_project(self):
            raise AssertionError("not used")

        async def list_ui_plugins(self):
            raise AssertionError("not used")

        async def inspect_ui_slots(self, *, root=None):
            raise AssertionError("not used")

        async def inspect_ui_plugin(self, plugin_id):
            raise AssertionError("not used")

        async def inspect_ui_plugin_source_references(self, plugin_id):
            raise AssertionError("not used")

    client = ConflictThenSuccessClient()
    service, activity = _service(root, client)
    observations = _observations(service, initial_hash)
    mutation_tool = create_app_ui_model_mutation_tool(service, observations)
    read_tools = create_project_control_tools(
        client,
        observations=observations,
        activity=activity,
    )
    arguments = {
        "operations": [
            {"type": "remove_instance", "instanceId": "sample-main"}
        ]
    }
    app_ui_path = root / APP_UI_MODEL_PATH
    app_ui_path.write_text(
        app_ui_path.read_text(encoding="utf-8") + "// external\n",
        encoding="utf-8",
    )
    external_hash = read_creator_file_state(root, APP_UI_MODEL_PATH).hash

    conflict = json.loads(asyncio.run(mutation_tool.ainvoke(arguments)))
    asyncio.run(read_tools[1].ainvoke({}))
    retry = json.loads(asyncio.run(mutation_tool.ainvoke(arguments)))

    assert conflict["error"]["code"] == "APP_UI_MODEL_HASH_CONFLICT"
    assert retry["ok"] is True
    assert client.calls == 2
    assert client.inputs == [
        {"appUIModelHash": initial_hash, "operations": arguments["operations"]},
        {"appUIModelHash": external_hash, "operations": arguments["operations"]},
    ]
