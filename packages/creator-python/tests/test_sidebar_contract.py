import json
from pathlib import Path

from jsonschema import Draft202012Validator
from agent_ui_creator.runtime_diagnostics.tool import RuntimeDiagnosticInspectionService
from agent_ui_creator.domain_agent.change_scope import resource_keys_for_tool_call


def test_sidebar_creator_operations_and_layout_schema():
    schema = json.loads((Path(__file__).resolve().parents[3] / "contracts/creator/app-ui-model-operation.schema.json").read_text())
    validator = Draft202012Validator(schema)
    slot = {"type": "slot", "plugins": []}
    for operation in [
        {"type": "insert_sidebar_item", "sidebarRef": "l0", "itemId": "files", "instanceId": "files-main"},
        {"type": "remove_sidebar_item", "sidebarRef": "l0", "itemId": "files"},
        {"type": "reorder_sidebar_items", "sidebarRef": "l0", "itemIds": ["history", "files"]},
        {"type": "update_layout_node_props", "nodeRef": "l0", "set": {"defaultActive": None}},
        {"type": "replace_layout_node", "nodeRef": "l0", "node": {"type": "sidebar", "defaultActive": None, "items": [{"id": "history", "child": slot}], "content": slot}},
    ]:
        validator.validate(operation)


def test_sidebar_diagnostics_include_both_branches():
    paths, refs = RuntimeDiagnosticInspectionService._build_authoring_layout_index({
        "appUIModel": {"layout": {"type": "sidebar", "nodeRef": "l0", "items": [{"id": "history", "child": {"type": "slot", "nodeRef": "l1"}}], "content": {"type": "slot", "nodeRef": "l2"}}}
    })
    assert paths == {"root": "l0", "root.items[0].child": "l1", "root.content": "l2"}
    assert refs == {"l0", "l1", "l2"}


def test_sidebar_moves_keep_instance_resource_scope():
    resources = resource_keys_for_tool_call("mutate_app_ui_model", {"operations": [{"type": "insert_sidebar_item", "sidebarRef": "l0", "itemId": "files", "instanceId": "files-main"}]})
    assert "plugin-instance:files-main" in resources
