import json
from pathlib import Path
from langchain_core.messages import AIMessage
from agent_ui_creator.operations import CreatorActionSelection, CreatorIntentPresentation, CreatorResolveResult
from agent_ui_creator.operations.models import CreatorAuthoringHandoff
from agent_ui_creator.domain_agent.source_grounding import SourceGroundingConvergenceMiddleware
from test_plugin_development_server import _app, _events, TrackingModel, ORDINARY_QUESTION


def test_server_question_resume_preserves_target_and_expanded_navigation_without_reads(tmp_path, monkeypatch):
    (tmp_path / ".agent-ui").mkdir()
    (tmp_path / ".agent-ui/project.json").write_text('{"mode":"assistant","sourceRoot":"src"}')
    owner = tmp_path / "src/plugins/sample/index.tsx"
    owner.parent.mkdir(parents=True)
    owner.write_text("export const sample = true;\n")
    model = TrackingModel(responses=[
        AIMessage(content="", tool_calls=[{"name":"ask_user_question","args":ORDINARY_QUESTION,"id":"q"}]),
        AIMessage(content="检查已恢复目标"),
    ])
    app, client = _app(tmp_path, monkeypatch, model, intent="none")
    handoff = CreatorAuthoringHandoff(targetId="plugin-source:sample",kind="plugin_source",name="Sample",
        description="sample owner",ownerRoot="src/plugins/sample",ownerPath="src/plugins/sample/index.tsx",
        definitionPath="src/plugins/sample/index.tsx",pluginId="sample")
    class Selector:
        def __init__(self, **kwargs): pass
        async def run(self, messages):
            return CreatorResolveResult(route="scoped_general_handoff",
                selection=CreatorActionSelection(decision="select_intent",taskIntent="modify",targetId=handoff.targetId),
                presentation=CreatorIntentPresentation(label="sample",kind="plugin_source",target_plugin_ids=("sample",),target_instance_ids=(),route="plugin_source"),handoff=handoff)
    monkeypatch.setattr("agent_ui_creator.server.ProductizedOperationEngine",Selector)
    observed=[]
    original=SourceGroundingConvergenceMiddleware._request
    def observe(self, request):
        if not observed:
            self.metrics.sourceFastPathExited=True
            self.metrics.sourceFastPathExitTool="inspect_ui_services"
            self.metrics.sourceFastPathExitReason="cross_layer_dependency"
        observed.append((self.handoff, self.metrics.sourceFastPathExited, dict(self.reads)))
        return original(self,request)
    monkeypatch.setattr(SourceGroundingConvergenceMiddleware,"_request",observe)
    first=_events(client,run_id="before",text="修改 sample")
    question=next(e["value"] for e in first if e.get("name")=="on_interrupt")
    pending=app.state.pending_creator_questions["thread-a"]
    assert pending.authoring_handoff==handoff
    assert pending.source_navigation["exited"] is True
    _events(client,run_id="after",resume={"interruptId":question["id"],"answers":{"ordinary":["short"]}})
    assert len(observed)>=2
    assert observed[1]==(handoff,True,{})
    # Context is navigation only: no file changes and no new takeover grant.
    assert owner.read_text()=="export const sample = true;\n"
