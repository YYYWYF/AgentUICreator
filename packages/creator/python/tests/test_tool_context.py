import json
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from agent_ui_creator.domain_agent.tool_context import compact_inspection_messages
from agent_ui_creator.domain_agent.tool_context import compact_superseded_inspections


def message(call, *, version="1", text="x", error=False):
    value={"ok":not error,"result":{"asset":{"pluginId":"custom","ownership":"project_source","description":"long "*100},
        "sharedTypes":{"status":"available","module":"public","packageVersion":version,
        "symbols":[{"name":"Widget","status":"available","type":text*500}]}}}
    return ToolMessage(name="inspect_ui_plugin",tool_call_id=call,content=json.dumps(value))


def test_repeated_facts_reference_prior_present_values_without_changing_messages():
    first,second=message("one"),message("two")
    original=second.content
    human=HumanMessage(content="keep my instructions")
    projected,saved=compact_inspection_messages([first,human,second])
    assert saved > 500
    assert second.content == original
    assert projected[1] is human
    result=json.loads(projected[2].content)["result"]
    assert result["asset"]["pluginId"] == "custom"
    assert result["asset"]["contextReference"].startswith("tool:one#")
    assert result["sharedTypes"]["symbols"][0]["contextReference"].startswith("tool:one#")
    assert "contextReference" not in projected[0].content
    assert projected[2].tool_call_id == "two"


def test_changed_version_content_and_errors_are_never_replaced_with_stale_facts():
    first=message("one")
    changed=message("two",text="y")
    version=message("three",version="2")
    error=message("four",error=True)
    projected,_=compact_inspection_messages([first,changed,version,error])
    for item in projected[1:3]:
        assert "type" in json.loads(item.content)["result"]["sharedTypes"]["symbols"][0]
    assert projected[-1] is error
    # A fresh model request without the earlier anchor must retain full facts.
    isolated,saved=compact_inspection_messages([message("two")])
    assert saved == 0
    assert "contextReference" not in isolated[0].content


def test_other_tool_outputs_approvals_and_source_reads_remain_verbatim():
    source=ToolMessage(name="read_file",tool_call_id="read",content="x"*2000)
    approval=ToolMessage(name="takeover_plugin_source",tool_call_id="approval",content="x"*2000)
    ai=AIMessage(content="reason",tool_calls=[{"name":"inspect_ui_plugin","args":{"pluginId":"custom"},"id":"one"}])
    values=[source,approval,ai]
    projected,saved=compact_inspection_messages(values)
    assert saved == 0
    assert all(a is b for a,b in zip(values,projected))


def inspection(call, name="inspect_ui_project", args=None, **result):
    return [AIMessage(content="", tool_calls=[{"name":name,"args":args or {},"id":call}]),
        ToolMessage(name=name,tool_call_id=call,content=json.dumps({"ok":True,"result":result}))]


def test_context_budget_archives_superseded_queries_without_changing_authority_or_latest_pages():
    values=[HumanMessage(content="保留现有功能，不接管源码")]
    for snapshot in ["old", "new"]:
        values += inspection(snapshot+"1",args={"view":"composition"},snapshotHash=snapshot,pageOffset=0,pageText="x"*20000,nextCursor="next")
        values += inspection(snapshot+"2",args={"cursor":"next"},snapshotHash=snapshot,pageOffset=20000,pageText="y"*20000,nextCursor=None)
    # Recent unrelated inspections cannot cause the latest complete Composition
    # snapshot to lose its first page or cursor linkage.
    for i in range(8):
        values += inspection(str(i),name="inspect_ui_services",args={"scope":i},facts="z"*1000)
    source=ToolMessage(name="read_file",tool_call_id="source",content="source"*2000)
    consent=ToolMessage(name="takeover_plugin_source",tool_call_id="consent",content="declined"*1000)
    error=ToolMessage(name="inspect_ui_project",tool_call_id="error",content='{"ok":false,"error":{"code":"stale_state"}}')
    values += [source,consent,error]
    original=[item.content for item in values]
    projected,saved=compact_superseded_inspections(values,budget=20000)
    assert saved > 39000
    assert [item.content for item in values] == original
    old=[item for item in projected if isinstance(item,ToolMessage) and item.tool_call_id.startswith("old")]
    assert len(old) == 2
    assert all(json.loads(item.content)["result"]["historicalObservationOmitted"] for item in old)
    for item in projected:
        if isinstance(item,ToolMessage) and item.tool_call_id.startswith("new"):
            assert "pageText" in json.loads(item.content)["result"]
    assert projected[0] is values[0]
    assert projected[-3:] == [source,consent,error]
    assert len(projected) == len(values)  # Correlation pairs and ids stay intact.


def test_budget_is_soft_and_never_discards_unique_facts_or_plugin_contract_anchors():
    values=inspection("a",name="inspect_ui_services",args={"scope":"a"},facts="x"*20000)
    values+=inspection("b",name="inspect_ui_services",args={"scope":"b"},facts="y"*20000)
    values+=[message("contract")]
    projected,saved=compact_superseded_inspections(values,budget=100)
    assert saved == 0
    assert all(a is b for a,b in zip(values,projected))
