from __future__ import annotations

import asyncio
import json
import os
import shutil
from pathlib import Path

from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.app_ui_model import (
    APP_UI_MODEL_PATH,
    COMPOSITION_REVISION_PATH,
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


def _authoring_plugins(model):
    result = []

    def visit_plugins(plugins):
        for plugin in plugins:
            result.append(plugin)
            for children in plugin.get("slots", {}).values():
                visit_plugins(children)

    visit_plugins(model.get("applicationPlugins", []))

    def visit_layout(node):
        if node["type"] == "slot":
            visit_plugins(node["plugins"])
        elif node["type"] == "panel":
            visit_layout(node["child"])
        else:
            for child in node["children"]:
                visit_layout(child)

    visit_layout(model["root"])
    return result


def _find_plugin(model, instance_id):
    return next(plugin for plugin in _authoring_plugins(model) if plugin["id"] == instance_id)


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
    composition = asyncio.run(client.inspect_ui_project(view="composition"))
    app_ui_model = asyncio.run(client.inspect_app_ui_model())
    plugins = asyncio.run(client.list_ui_plugins())
    slots = asyncio.run(client.inspect_ui_slots())
    plugin_id = plugins["pluginAssets"][0]["pluginId"]
    plugin = asyncio.run(client.inspect_ui_plugin(plugin_id))
    services = asyncio.run(client.inspect_ui_services())
    references = asyncio.run(client.inspect_ui_plugin_source_references(plugin_id))
    sources = asyncio.run(client.inspect_agent_ui_sources())

    assert project["schemaVersion"] == 3
    assert composition["view"] == "composition"
    assert composition["appUIModel"]["hash"] == project["appUIModel"]["hash"]
    assert composition["capabilityCatalogRevision"] == (
        project["capabilityCatalog"]["revision"]
    )
    assert "pluginAssets" not in composition
    assert "uiStack" not in composition
    assert "agentUI" not in composition
    assert app_ui_model["hash"] == project["appUIModel"]["hash"]
    assert plugins["appUIModelHash"] == app_ui_model["hash"]
    assert slots["appUIModelHash"] == app_ui_model["hash"]
    assert plugin["asset"]["pluginId"] == plugin_id
    assert services["appUIModelHash"] == app_ui_model["hash"]
    assert isinstance(services["services"], list)
    assert references["pluginId"] == plugin_id
    assert sources["sourceRoot"] == "agent-ui"
    assert sources["metadataRoot"] == ".agent-ui"


def test_real_target_mutation_uses_temp_copy_and_python_transaction(tmp_path):
    project_root = _copy_target(tmp_path, "agent-frontend")
    client, activity, service = _mutation_service(
        project_root, "python-real-target-mutation"
    )
    inspection = asyncio.run(client.inspect_app_ui_model())
    instance_id = _authoring_plugins(inspection["model"])[0]["id"]

    result = asyncio.run(
        service.mutate(
            app_ui_model_hash=inspection["hash"],
            operations=[
                {
                    "type": "update_plugin_props",
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
    instance_id = _authoring_plugins(inspection["result"]["model"])[0]["id"]
    mutation = json.loads(
        asyncio.run(
            mutation_tool.ainvoke(
                {
                    "operations": [
                        {
                            "type": "update_plugin_props",
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


def test_real_insert_plugin_updates_composition_artifacts_and_is_undoable(tmp_path):
    run_id = "python-real-app-ui-registry-undo"
    instance_id = "agent-activity-feed-main"
    plugin_id = "test-unselected-theme-switch"
    changed_paths = {
        APP_UI_MODEL_PATH,
        COMPOSITION_REVISION_PATH,
        REGISTRY_PATH,
    }
    source_app_ui_path = TARGET_PROJECT / APP_UI_MODEL_PATH
    source_registry_path = TARGET_PROJECT / REGISTRY_PATH
    source_app_ui_content = source_app_ui_path.read_bytes()
    source_registry_content = source_registry_path.read_bytes()

    project_root = _copy_target(tmp_path, "real-app-ui-registry-undo")
    plugin_root = project_root / "plugins" / plugin_id
    shutil.copytree(project_root / "plugins" / "theme-switch", plugin_root)
    manifest_path = plugin_root / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["id"] = plugin_id
    manifest["name"] = "Test unselected theme switch"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
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
        "Real two-path fixture drifted: the temporary plugin must exist as exactly "
        "one Plugin asset."
    )
    assert all(plugin["id"] != instance_id for plugin in _authoring_plugins(before["model"])), (
        "Real two-path fixture drifted: agent-activity-feed-main must be absent "
        "from AppUIModel."
    )
    assert plugin_id not in before_project["activeComposition"]["selectedPluginIds"], (
        "Real two-path fixture drifted: antd-x-activity-feed must be absent from "
        "the selected Registry."
    )
    assert plugin_id not in original_registry_content.decode("utf-8"), (
        "Real two-path fixture drifted: registry.generated.ts must not contain "
        "the temporary plugin."
    )

    operation = {
        "type": "insert_plugin",
        "plugin": {
            "id": instance_id,
            "pluginId": plugin_id,
            "enabled": True,
        },
        "target": {"type": "layout_slot", "slotNodeId": "theme-control"},
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
    added_instance = _find_plugin(after["model"], instance_id)
    registry_state = read_creator_file_state(project_root, REGISTRY_PATH)
    registry_content = registry_path.read_text(encoding="utf-8")

    assert target_result["changed"] is True
    assert set(target_result["changedPaths"]) == changed_paths
    assert result.mutation_revision == 2
    assert activity.revision == 2
    assert added_instance == operation["plugin"]
    assert plugin_id in after_project["activeComposition"]["selectedPluginIds"]
    assert plugin_id in after_project["activeComposition"]["resolvedPluginIds"]
    assert after_project["capabilityCatalog"]["generatedFileFresh"] is True
    assert f'"./{plugin_id}/definition"' in registry_content
    assert target_result["appUIModel"]["beforeHash"] == before["hash"]
    assert target_result["appUIModel"]["afterHash"] == after["hash"]
    assert target_result["snapshotToken"]["appUIModelHash"] == after["hash"]
    assert (
        target_result["snapshotToken"]["capabilityCatalogSourceHash"]
        == registry_state.hash
    )
    assert service.metrics.to_dict() == {
        "requests": 1,
        "operations": 1,
        "hashConflicts": 0,
        "changedPaths": 3,
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
    assert all(plugin["id"] != instance_id for plugin in _authoring_plugins(restored["model"]))
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
            [{"type": "remove_plugin", "instanceId": "missing-phase-3b2"}],
            "PLUGIN_NOT_FOUND",
        ),
        (
            [
                {
                    "type": "insert_plugin",
                    "plugin": {
                        "id": "missing-plugin-instance",
                        "pluginId": "missing-phase-3b2-plugin",
                        "enabled": False,
                    },
                    "target": {
                        "type": "layout_slot",
                        "slotNodeId": "conversation-navigation",
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
