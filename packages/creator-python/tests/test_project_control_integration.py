from __future__ import annotations

import asyncio
import os
import shutil
from pathlib import Path

from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.app_ui_model import AppUIModelMutationService, ProjectMutationCoordinator
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


def test_real_target_two_path_registry_mutation_and_undo(tmp_path):
    project_root = _copy_target(tmp_path, "two-path")
    client, activity, service = _mutation_service(project_root, "python-two-path")
    inspection = asyncio.run(client.inspect_ui_project())
    selected = set(inspection["registry"]["selectedPluginIds"])
    asset = next(
        asset for asset in inspection["pluginAssets"] if asset["pluginId"] not in selected
    )

    result = asyncio.run(
        service.mutate(
            app_ui_model_hash=inspection["appUIModel"]["hash"],
            operations=[
                {
                    "type": "add_instance",
                    "instance": {
                        "id": "phase-3b2-two-path",
                        "pluginId": asset["pluginId"],
                        "enabled": False,
                    },
                }
            ],
        )
    )
    receipt = activity.finish()

    assert result.target_result["changedPaths"] == [
        "app-ui/app-ui.json",
        "plugins/registry.generated.ts",
    ]
    assert activity.revision == 2
    assert len(receipt["files"]) == 2
    activity.transactions.undo("python-two-path")


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
