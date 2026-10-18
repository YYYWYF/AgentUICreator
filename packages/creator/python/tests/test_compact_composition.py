from copy import deepcopy
import json

from agent_ui_creator.domain_tools.operator_tools import _compact_composition_facts, _render_project_inspection


def _fixture():
    leaf = {"id": "leaf", "pluginId": "text", "enabled": False, "config": {"custom": [1, "中文"]}}
    parent = {"id": "parent", "pluginId": "surface", "enabled": True, "slots": {"content": [leaf]}}
    definition = {"description": "semantic boundary", "cardinality": "one", "optional": True, "accepts": {"anyOfCapabilities": ["text"]}}
    target = {"type": "plugin_slot", "parentInstanceId": "parent", "slot": "content"}
    return {
        "appUIModel": {"hash": "a" * 64, "layout": {"plugins": [parent]}, "slots": [{
            "target": target, "description": definition["description"], "cardinality": "one", "mode": "content", "optional": True,
            "accepts": definition["accepts"], "owner": {"pluginId": "surface", "instanceId": "parent", "kind": "plugin"}, "plugins": [leaf],
        }]},
        "pluginInstances": [{**parent, "target": {"type": "layout_slot", "slotRef": "l1"}, "index": 0, "effectiveEnabled": True},
                            {**leaf, "target": target, "index": 0, "effectiveEnabled": False}],
        "capabilitySummaries": [{"pluginId": "surface", "childSlots": {"content": definition}, "selectionOwner": "composition",
                                 "requiredServices": {"names": [], "status": "not-required", "missing": []}, "optionalServices": {"names": [], "available": []}}],
        "workspaceDiagnostics": [{"code": "preserved-diagnostic"}], "unknownFutureFact": {"value": True},
        "observationCoverage": ["composition.instances", "composition.slots"],
    }


def _expand(encoded):
    result = deepcopy(encoded)
    if "compositionEncoding" not in result:
        return result
    encoding = result.pop("compositionEncoding")
    index = {item["id"]: item for item in result["pluginInstances"]}
    def expand(value):
        if isinstance(value, dict):
            if set(value) == {"instanceRef"}:
                return expand({key: item for key, item in index[value["instanceRef"]].items() if key not in {"target", "index", "effectiveEnabled"}})
            return {key: expand(item) for key, item in value.items()}
        return [expand(item) for item in value] if isinstance(value, list) else value
    result["appUIModel"] = expand(result["appUIModel"])
    result["pluginInstances"] = expand(result["pluginInstances"])
    for item in result["capabilitySummaries"]:
        for key, value in encoding["capabilitySummaryDefaults"].items():
            item.setdefault(key, value)
    summaries = {item["pluginId"]: item for item in result["capabilitySummaries"]}
    for slot in result["appUIModel"]["slots"]:
        reference = slot.pop("slotDefinitionRef", None)
        if reference is None:
            continue
        definition = summaries[reference["pluginId"]]["childSlots"][reference["slot"]]
        slot.update(description=definition["description"], cardinality=definition["cardinality"], mode=definition.get("mode", "content"), optional=definition.get("optional") is True)
        if "accepts" in definition: slot["accepts"] = definition["accepts"]
    return result


def test_compaction_roundtrip_preserves_all_facts_and_does_not_mutate_source():
    source = _fixture()
    original = deepcopy(source)
    compact = _compact_composition_facts(source)
    assert compact["appUIModel"]["layout"]["plugins"] == [{"instanceRef": "parent"}]
    assert compact["appUIModel"]["slots"][0]["slotDefinitionRef"]["slot"] == "content"
    assert _expand(compact) == original
    assert source == original


def test_mismatched_contract_and_reference_shaped_user_config_are_never_discarded():
    source = _fixture()
    source["appUIModel"]["slots"][0]["mode"] = "renderer"
    assert _expand(_compact_composition_facts(source)) == source
    source["pluginInstances"][0]["config"] = {"instanceRef": "user-value"}
    assert _compact_composition_facts(source) is source


def test_compacted_oversized_snapshot_still_requires_every_page():
    source = _fixture()
    source["unknownFutureFact"] = "中文" * 30000
    compact = _compact_composition_facts(source)
    rendered, complete, state = _render_project_inspection(compact, None, state=None, revision=7)
    assert not complete
    page = json.loads(rendered)["result"]
    invalid_cursor = page["nextCursor"].rsplit(":", 1)[0] + ":" + str(int(page["nextCursor"].rsplit(":", 1)[1]) + 1)
    rejected, complete, _ = _render_project_inspection(compact, invalid_cursor, state=state, revision=7)
    assert json.loads(rejected)["ok"] is False
    assert not complete


def test_pages_fit_utf8_and_escaping_limits_and_reassemble_exactly():
    from agent_ui_creator.domain_tools.operator_tools import MAX_DOMAIN_TOOL_RESULT_BYTES, MAX_DOMAIN_TOOL_RESULT_CHARS
    source = {"text": ('中文\\"\n' * 20000)}
    state = None
    cursor = None
    chunks = []
    while True:
        rendered, complete, state = _render_project_inspection(source, cursor, state=state, revision=7)
        assert len(rendered) <= MAX_DOMAIN_TOOL_RESULT_CHARS
        assert len(rendered.encode('utf-8')) <= MAX_DOMAIN_TOOL_RESULT_BYTES
        page = json.loads(rendered)['result']
        chunks.append(page['pageText'])
        if complete:
            break
        assert len(rendered.encode('utf-8')) > MAX_DOMAIN_TOOL_RESULT_BYTES - 10
        cursor = page['nextCursor']
    assert json.loads(''.join(chunks)) == {'ok': True, 'result': source}
