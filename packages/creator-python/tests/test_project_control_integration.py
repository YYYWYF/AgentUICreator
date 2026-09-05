from __future__ import annotations

import asyncio
import json
import os
import shutil
from pathlib import Path

from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.app_ui_model import (
    APP_UI_MODEL_PATH,
    REGISTRY_PATH,
    AppUIModelMutationService,
    ProjectMutationCoordinator,
)
from agent_ui_creator.app_ui_model.mutation_tool import (
    create_app_ui_model_mutation_tool,
)
from agent_ui_creator.domain_state import DomainObservationContext
from agent_ui_creator.domain_tools import create_project_control_tools
from agent_ui_creator.files import read_creator_file_state
from agent_ui_creator.project_control import ProjectControlClient

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
TARGET_PROJECT = REPOSITORY_ROOT / "examples" / "agent-frontend"


def _copy_target(tmp_path: Path, name: str) -> Path:
    project_root = tmp_path / name
    shutil.copytree(
        TARGET_PROJECT,
        project_root,
        ignore=shutil.ignore_patterns("node_modules", "dist", ".agentuicreator"),
    )
    os.symlink(TARGET_PROJECT / "node_modules", project_root / "node_modules")
    return project_root


def _mutation_service(project_root: Path, run_id: str):
    client = ProjectControlClient(project_root=project_root)
    activity = CreatorActivityRecorder(project_root)
    activity.begin(run_id)
    service = AppUIModelMutationService(
        project_root=project_root,
        project_control=client,
        activity=activity,
        mutation_coordinator=ProjectMutationCoordinator(),
    )
    return client, activity, service


def test_real_target_project_read_operations_execute_through_tsx():
    client = ProjectControlClient(project_root=TARGET_PROJECT)

    project = asyncio.run(client.inspect_ui_project())
    app_ui_model = asyncio.run(client.inspect_app_ui_model())
    plugins = asyncio.run(client.list_ui_plugins())
    slots = asyncio.run(client.inspect_ui_slots())
    plugin_id = plugins["pluginAssets"][0]["pluginId"]
    plugin = asyncio.run(client.inspect_ui_plugin(plugin_id))
    references = asyncio.run(client.inspect_ui_plugin_source_references(plugin_id))

    assert project["schemaVersion"] == 2
    assert app_ui_model["hash"] == project["appUIModel"]["hash"]
    assert plugins["appUIModelHash"] == app_ui_model["hash"]
    assert slots["appUIModelHash"] == app_ui_model["hash"]
    assert plugin["asset"]["pluginId"] == plugin_id
    assert references["pluginId"] == plugin_id


def test_real_target_mutation_uses_temp_copy_and_python_transaction(tmp_path):
    project_root = _copy_target(tmp_path, "agent-frontend")
    client, activity, service = _mutation_service(
        project_root, "python-real-target-mutation"
    )
    inspection = asyncio.run(client.inspect_app_ui_model())
    instance_id = next(iter(inspection["model"]["pluginInstances"]))

    result = asyncio.run(
        service.mutate(
            app_ui_model_hash=inspection["hash"],
            operations=[
                {
                    "type": "update_instance_props",
                    "instanceId": instance_id,
                    "set": {"phase3B2Integration": True},
                }
            ],
        )
    )
    receipt = activity.finish()

    assert result.target_result["changedPaths"] == ["app-ui/app-ui.json"]
    assert result.mutation_revision == 1
    assert receipt["transaction"]["undoable"] is True
    activity.transactions.undo("python-real-target-mutation")
    restored = asyncio.run(client.inspect_app_ui_model())
    assert restored["hash"] == inspection["hash"]


def test_real_agent_tools_inspect_once_then_mutate_with_host_owned_hash(tmp_path):
    project_root = _copy_target(tmp_path, "host-owned-hash")
    client, activity, service = _mutation_service(
        project_root, "python-host-owned-hash"
    )
    observations = DomainObservationContext()
    read_tools = create_project_control_tools(
        client,
        observations=observations,
        activity=activity,
    )
    mutation_tool = create_app_ui_model_mutation_tool(service, observations)

    inspection = json.loads(asyncio.run(read_tools[1].ainvoke({})))
    instance_id = next(iter(inspection["result"]["model"]["pluginInstances"]))
    mutation = json.loads(
        asyncio.run(
            mutation_tool.ainvoke(
                {
                    "operations": [
                        {
                            "type": "update_instance_props",
                            "instanceId": instance_id,
                            "set": {"hostOwnedHashIntegration": True},
                        }
                    ]
                }
            )
        )
    )

    assert mutation["ok"] is True
    assert client.metrics.requestsByOperation["inspect_app_ui_model"] == 1
    assert client.metrics.requestsByOperation["mutate_app_ui_model"] == 1
    assert observations.snapshot()["appUIModel"] == {
        "hash": mutation["result"]["appUIModel"]["afterHash"],
        "revision": 1,
        "source": "mutation_result",
    }
    assert observations.metrics.hashReuses == 1


def test_real_add_instance_updates_app_ui_and_registry_and_is_undoable(tmp_path):
    run_id = "python-real-app-ui-registry-undo"
    instance_id = "agent-activity-feed-main"
    plugin_id = "antd-x-activity-feed"
    changed_paths = {APP_UI_MODEL_PATH, REGISTRY_PATH}
    source_app_ui_path = TARGET_PROJECT / APP_UI_MODEL_PATH
    source_registry_path = TARGET_PROJECT / REGISTRY_PATH
    source_app_ui_content = source_app_ui_path.read_bytes()
    source_registry_content = source_registry_path.read_bytes()

    project_root = _copy_target(tmp_path, "real-app-ui-registry-undo")
    app_ui_path = project_root / APP_UI_MODEL_PATH
    registry_path = project_root / REGISTRY_PATH
    original_app_ui_content = app_ui_path.read_bytes()
    original_registry_content = registry_path.read_bytes()
    original_registry_hash = read_creator_file_state(
        project_root, REGISTRY_PATH
    ).hash
    client, activity, service = _mutation_service(project_root, run_id)

    before = asyncio.run(client.inspect_app_ui_model())
    before_project = asyncio.run(client.inspect_ui_project())
    matching_assets = [
        asset
        for asset in before_project["pluginAssets"]
        if asset["pluginId"] == plugin_id
    ]
    assert len(matching_assets) == 1, (
        "Real two-path fixture drifted: antd-x-activity-feed must exist as exactly "
        "one Plugin asset."
    )
    assert instance_id not in before["model"]["pluginInstances"], (
        "Real two-path fixture drifted: agent-activity-feed-main must be absent "
        "from AppUIModel."
    )
    assert plugin_id not in before_project["registry"]["selectedPluginIds"], (
        "Real two-path fixture drifted: antd-x-activity-feed must be absent from "
        "the selected Registry."
    )
    assert plugin_id not in original_registry_content.decode("utf-8"), (
        "Real two-path fixture drifted: registry.generated.ts must not contain "
        "antd-x-activity-feed."
    )

    operation = {
        "type": "add_instance",
        "instance": {
            "id": instance_id,
            "pluginId": plugin_id,
            "enabled": True,
            "mount": {"slotId": "inspector.activity"},
        },
    }
    result = asyncio.run(
        service.mutate(
            app_ui_model_hash=before["hash"],
            operations=[operation],
        )
    )
    target_result = result.target_result
    after = asyncio.run(client.inspect_app_ui_model())
    after_project = asyncio.run(client.inspect_ui_project())
    added_instance = after["model"]["pluginInstances"][instance_id]
    registry_state = read_creator_file_state(project_root, REGISTRY_PATH)
    registry_content = registry_path.read_text(encoding="utf-8")

    assert target_result["changed"] is True
    assert set(target_result["changedPaths"]) == changed_paths
    assert result.mutation_revision == 2
    assert activity.revision == 2
    assert added_instance == operation["instance"]
    assert plugin_id in after_project["registry"]["selectedPluginIds"]
    assert plugin_id in after_project["registry"]["registeredPluginIds"]
    assert after_project["registry"]["generatedFileFresh"] is True
    assert f'"./{plugin_id}/definition"' in registry_content
    assert target_result["appUIModel"]["beforeHash"] == before["hash"]
    assert target_result["appUIModel"]["afterHash"] == after["hash"]
    assert target_result["snapshotToken"]["appUIModelHash"] == after["hash"]
    assert target_result["snapshotToken"]["registryHash"] == registry_state.hash
    assert service.metrics.to_dict() == {
        "requests": 1,
        "operations": 1,
        "hashConflicts": 0,
        "changedPaths": 2,
        "resultMismatches": 0,
    }
    assert client.metrics.requestsByOperation["mutate_app_ui_model"] == 1
    assert client.metrics.requestsByOperation["inspect_app_ui_model"] >= 1

    receipt = activity.finish()
    assert {file["path"] for file in receipt["files"]} == changed_paths
    assert all(file["status"] == "modified" for file in receipt["files"])
    assert receipt["verification"]["status"] == "not-run"
    assert receipt["transaction"] == {"runId": run_id, "undoable": True}

    transaction = activity.transactions.load(run_id)
    assert transaction.mutation_revision == 2
    assert {file.path for file in transaction.files} == changed_paths
    assert all(file.status == "modified" for file in transaction.files)
    assert activity.transactions.status(run_id).undoable is True

    undo = activity.transactions.undo(run_id)
    assert set(undo.changed_paths) == changed_paths
    assert app_ui_path.read_bytes() == original_app_ui_content
    assert registry_path.read_bytes() == original_registry_content
    assert activity.transactions.status(run_id).undoable is False

    restored = asyncio.run(client.inspect_app_ui_model())
    assert restored["hash"] == before["hash"]
    assert instance_id not in restored["model"]["pluginInstances"]
    assert (
        read_creator_file_state(project_root, REGISTRY_PATH).hash
        == original_registry_hash
    )
    assert client.metrics.requestsByOperation["mutate_app_ui_model"] == 1
    assert source_app_ui_path.read_bytes() == source_app_ui_content
    assert source_registry_path.read_bytes() == source_registry_content


def test_real_target_invalid_operation_and_registry_failure_leave_disk_unchanged(tmp_path):
    project_root = _copy_target(tmp_path, "failures")
    client, activity, service = _mutation_service(project_root, "python-failures")
    inspection = asyncio.run(client.inspect_app_ui_model())
    before_app = (project_root / "app-ui/app-ui.json").read_bytes()
    before_registry = (project_root / "plugins/registry.generated.ts").read_bytes()

    for operations, expected_code in [
        (
            [{"type": "remove_instance", "instanceId": "missing-phase-3b2"}],
            "PLUGIN_INSTANCE_NOT_FOUND",
        ),
        (
            [
                {
                    "type": "add_instance",
                    "instance": {
                        "id": "missing-plugin-instance",
                        "pluginId": "missing-phase-3b2-plugin",
                        "enabled": False,
                    },
                }
            ],
            "PLUGIN_REGISTRY_GENERATION_FAILED",
        ),
    ]:
        try:
            asyncio.run(
                service.mutate(
                    app_ui_model_hash=inspection["hash"],
                    operations=operations,
                )
            )
        except Exception as error:
            assert getattr(error, "code", None) == expected_code
        else:
            raise AssertionError(f"Expected {expected_code}")

    assert (project_root / "app-ui/app-ui.json").read_bytes() == before_app
    assert (project_root / "plugins/registry.generated.ts").read_bytes() == before_registry
    assert activity.revision == 0
    assert activity.finish()["files"] == []
