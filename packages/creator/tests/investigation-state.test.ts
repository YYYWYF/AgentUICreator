import { expect, it } from "vitest";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { InvestigationState } from "../src/agent/investigation-state.js";
import { CreatorContextWindow, estimateMessageTokens } from "../src/agent/context-window.js";

it("recognizes completed document ranges and enabled groups, while allowing changed facts", () => {
  const state = new InvestigationState();
  const doc = { documentId: "api", sectionId: "a", sha256: "old", offset: 0, content: "Actual public contract", nextOffset: null };
  state.record("read_creator_documentation", { limit: 4000 }, doc, 0);
  expect(state.record("read_creator_documentation", { limit: 8000 }, doc, 0)?.repeatedObservation).toBe(true);
  expect(state.record("read_creator_documentation", {}, { ...doc, sha256: "new", content: "Changed contract" }, 0)).toBeUndefined();
  state.record("enable_creator_tools", {}, {enabledGroups:["debugging"]}, 0);
  expect(state.record("enable_creator_tools", {}, {enabledGroups:["debugging"]}, 0)?.instruction).toContain("already observed");
  expect(state.record("enable_creator_tools", {}, {enabledGroups:["debugging","history"]}, 0)).toBeUndefined();
});
it("retains validation boundaries and detects real runtime changes, even at the same code revision", () => {
  const state = new InvestigationState();
  const runtime = { runtimeStatus: "available", currentErrors: [], instances: [{id:"p1",rect:{width:100}}] };
  state.record("inspect_runtime_layout", {}, runtime, 1);
  expect(state.record("inspect_runtime_layout", {}, runtime, 1)?.instruction).toContain("cannot resolve text");
  expect(state.record("inspect_runtime_layout", {}, { ...runtime, instances: [{id:"p1",rect:{width:200}}] }, 1)).toBeUndefined();
  state.record("verify_creator_outcome", {}, {status:"satisfied",facts:[{kind:"file_text",path:"src/a.ts",matched:true,hash:"x"}],evidenceBoundary:"Source only, not behavior"}, 1);
  const text = String(state.context(1600, 2, ["debugging"])[0]?.content);
  expect(text).toContain('"historicalRevision":true');
  expect(text).toContain("Source only, not behavior");
  expect(text).toContain('"enabledGroups":["debugging"]');
});
it("survives lossy summaries without transferring observations into a new task", async () => {
  const state = new InvestigationState();
  state.record("enable_creator_tools", {}, {enabledGroups:["debugging"]}, 0);
  state.record("validate_creator_changes", {}, {status:"passed",revision:1,checks:[]}, 1);
  const window = new CreatorContextWindow({ environment:{CREATOR_CONTEXT_MAX_TOKENS:"6000",CREATOR_CONTEXT_KEEP_TOKENS:"500",CREATOR_MODEL_MAX_TOKENS:"512"},
    request:"Change the view",signal:()=>new AbortController().signal,workingContext:budget=>state.context(Math.min(1000,budget),1,["debugging"]),
    model:()=>({invoke:async()=>new AIMessage("Historical summary without tool observations")}) as any,log:async()=>{} });
  const messages = [new HumanMessage("history "+"x".repeat(24000)), new HumanMessage("Change the view")];
  const result = await window.project(messages, []);
  expect(window.stats.compactions).toBeGreaterThan(0);
  expect(result.some(m=>String(m.content).includes('"static_validation"'))).toBe(true);
  expect(estimateMessageTokens(state.context(650,1,["debugging"]))).toBeLessThanOrEqual(650);
  expect(String(new InvestigationState().context(650,0,[])[0]?.content)).not.toContain("static_validation");
  for(let i=0;i<150;i++) expect(state.record("read_creator_documentation",{}, {documentId:"api",sectionId:String(i),sha256:String(i),content:String(i)},1)).toBeUndefined();
});
