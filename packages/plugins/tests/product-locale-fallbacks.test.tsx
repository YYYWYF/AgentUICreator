// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AssistantRuntimeProvider, useLocalRuntime, ThreadPrimitive, type ThreadMessageLike } from "@assistant-ui/react";
import { afterEach, expect, it, vi } from "vitest";
import { AgentUILocaleProvider, AGENT_UI_PRESENTATION_LOCALES, formatPresentationMessage, type AgentUILocaleCode } from "../src/locale";
import { ConversationThreadListNew, ConversationThreadListSearch, ConversationTaskGroup } from "../src/public";
import { ToolFallback } from "../src/internal/adapters/assistant-ui/components/assistant-ui/elements/tool-fallback.aui";
import { ReasoningRoot, ReasoningTrigger } from "../src/internal/adapters/assistant-ui/components/assistant-ui/elements/reasoning";
import { ToolGroupRoot, ToolGroupTrigger } from "../src/internal/adapters/assistant-ui/components/assistant-ui/elements/tool-group.aui";
import { summaryLabel, type TaskSummary } from "../src/internal/adapters/assistant-ui/components/assistant-ui/elements/agent-status.aui";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); });
function Host({ locale, children }: { locale: AgentUILocaleCode; children: ReactNode }) {
  const runtime = useLocalRuntime({ async *run() {} });
  return <AssistantRuntimeProvider runtime={runtime}><AgentUILocaleProvider locale={locale}>{children}</AgentUILocaleProvider></AssistantRuntimeProvider>;
}
async function mount(children: ReactNode, locale: AgentUILocaleCode = "zh-CN") {
  const el = document.createElement("div"); document.body.append(el); root = createRoot(el);
  await act(async () => root!.render(<Host locale={locale}>{children}</Host>)); return el;
}
it("localizes public defaults and preserves explicit composition overrides", async () => {
  const children = <><ConversationThreadListNew /><ConversationThreadListNew><span>Custom $&</span></ConversationThreadListNew><ConversationThreadListSearch value="draft" onValueChange={() => {}} /></>;
  const el = await mount(children);
  expect(el.textContent).toContain("新建会话"); expect(el.textContent).toContain("Custom $&");
  expect(el.querySelectorAll('[data-slot="aui_thread-list-new-icon"]')).toHaveLength(1);
  expect(el.querySelector('[data-slot="aui_thread-list-new-label"]')?.textContent).toBe("新建会话");
  expect(el.querySelector("input")?.getAttribute("aria-label")).toBe("搜索会话");
  await act(async () => root!.render(<Host locale="en-US">{children}</Host>));
  expect(el.textContent).toContain("New Thread"); expect(el.querySelector("input")?.value).toBe("draft");
  expect(el.querySelectorAll('[data-slot="aui_thread-list-new-icon"]')).toHaveLength(1);
});
it.each(["zh-CN", "en-US"] as const)("localizes reasoning, count, failure headings in %s", async locale => {
  const el = await mount(<><ReasoningRoot><ReasoningTrigger duration={3} /></ReasoningRoot><ToolGroupRoot><ToolGroupTrigger count={2} /></ToolGroupRoot><ToolFallback.Error status={{type:"incomplete",reason:"error",error:"backend $& error"}} /></>, locale);
  const messages = AGENT_UI_PRESENTATION_LOCALES[locale];
  expect(el.textContent).toContain(messages.conversation.reasoning);
  expect(el.textContent).toContain(formatPresentationMessage(messages.toolPresentation.calls,{count:2}));
  expect(el.textContent).toContain(messages.toolPresentation.error);
  expect(el.textContent).toContain("backend $& error");
});
it("switches approval labels without changing the submitted decision or typed note", async () => {
  const respond = vi.fn(async () => {});
  const children = <ToolFallback.Approval approval={{id:"approval",allowFreeform:true}} respondToApproval={respond} status={{type:"requires-action",reason:"tool-calls"}} />;
  const el = await mount(children);
  expect(el.textContent).toContain("允许"); expect(el.textContent).toContain("拒绝");
  const note = el.querySelector("textarea")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(note,"审批备注 $&"); note.dispatchEvent(new Event("input",{bubbles:true})); });
  await act(async () => root!.render(<Host locale="en-US">{children}</Host>));
  const allow = [...el.querySelectorAll("button")].find(b=>b.textContent==="Allow")!;
  await act(async () => allow.click()); expect(el.querySelector("textarea")?.value).toBe("审批备注 $&"); expect(respond).toHaveBeenCalledWith({approved:true,text:"审批备注 $&"});
});
it("keeps legacy tool result strings unchanged", async () => {
  const addResult = vi.fn();
  const el = await mount(<ToolFallback.Approval addResult={addResult} status={{type:"requires-action",reason:"tool-calls"}} />);
  await act(async () => [...el.querySelectorAll("button")].find(b=>b.textContent==="拒绝")!.click());
  expect(addResult).toHaveBeenCalledWith("User denied tool execution");
});
it("localizes task summaries and preserves Agent-supplied task labels", () => {
  const s: TaskSummary = { total:3,running:2,waiting:0,failed:0 } as TaskSummary;
  expect(summaryLabel(s,AGENT_UI_PRESENTATION_LOCALES["zh-CN"].tasks)).toBe("3 项任务中有 2 项正在运行");
  expect(summaryLabel({...s,running:0,waiting:1},AGENT_UI_PRESENTATION_LOCALES["zh-CN"].tasks)).toBe("1 项任务等待输入");
  expect(summaryLabel({...s,running:1,runningLabel:"Agent $& label"},AGENT_UI_PRESENTATION_LOCALES["zh-CN"].tasks)).toBe("Agent $& label");
  expect(formatPresentationMessage("{value}",{value:"$&{count}"})).toBe("$&{count}");
});
it("preserves Agent-supplied option labels and protocol option IDs", async () => {
  const respond = vi.fn(async () => {});
  const el = await mount(<ToolFallback.Approval approval={{id:"options",options:[{id:"one",kind:"allow-once"},{id:"custom",kind:"custom",label:"Agent $& option"}]}} respondToApproval={respond} status={{type:"requires-action",reason:"tool-calls"}} />);
  expect(el.textContent).toContain("允许"); expect(el.textContent).toContain("Agent $& option");
  await act(async () => [...el.querySelectorAll("button")].find(b=>b.textContent==="Agent $& option")!.click());
  expect(respond).toHaveBeenCalledWith({optionId:"custom",approved:true});
});

it("localizes task-group counts and task accessibility while preserving tool names and node identity", async () => {
  const initialMessages: ThreadMessageLike[] = [{ role:"assistant", content:[
    {type:"tool-call",toolCallId:"a",toolName:"first_tool",args:{task:"Agent task $&"},result:"done"},
    {type:"tool-call",toolCallId:"b",toolName:"second_tool",args:{task:"Other task"},result:"done"},
  ]}];
  const group = {type:"group-task",indices:[0,1],counts:{running:1,requiresAction:1}};
  function Message(){return <ConversationTaskGroup group={group}/>;}
  function UserMessage(){return null;}
  function Tasks({locale}:{locale:AgentUILocaleCode}){
    const runtime=useLocalRuntime({async *run(){}},{initialMessages});
    return <AssistantRuntimeProvider runtime={runtime}><AgentUILocaleProvider locale={locale}><ThreadPrimitive.Root><ThreadPrimitive.Messages components={{AssistantMessage:Message,UserMessage}}/></ThreadPrimitive.Root></AgentUILocaleProvider></AssistantRuntimeProvider>;
  }
  const el=document.createElement("div");document.body.append(el);root=createRoot(el);
  await act(async()=>root!.render(<Tasks locale="zh-CN"/>));
  expect(el.querySelector('[data-slot="aui_task-group-summary"]')?.textContent).toBe("2 项任务 · 1 项正在运行 · 1 项等待输入");
  expect(el.textContent).toContain("Agent task $&");
  const cards=[...el.querySelectorAll('[data-slot="task-card"]')];
  expect(cards).toHaveLength(2);
  expect(cards[0]?.querySelector(".sr-only")?.textContent).toBe("已完成");
  await act(async()=>root!.render(<Tasks locale="en-US"/>));
  expect(el.querySelector('[data-slot="aui_task-group-summary"]')?.textContent).toBe("2 tasks · 1 running · 1 waiting");
  expect(el.querySelector('[data-slot="task-card"]')).toBe(cards[0]);
});
it("preserves confirmation state and option IDs when language changes", async () => {
  const respond=vi.fn(async()=>{});
  const children=<ToolFallback.Approval approval={{id:"confirm",options:[{id:"persist",kind:"allow-always",confirm:{description:"Agent-supplied description"}}]}} respondToApproval={respond} status={{type:"requires-action",reason:"tool-calls"}}/>;
  const el=await mount(children);
  await act(async()=>[...el.querySelectorAll("button")].find(b=>b.textContent==="始终允许")!.click());
  expect(respond).not.toHaveBeenCalled();expect(el.textContent).toContain("始终允许?");
  const confirm=[...el.querySelectorAll("button")].find(b=>b.textContent==="确认")!;
  await act(async()=>root!.render(<Host locale="en-US">{children}</Host>));
  expect(el.textContent).toContain("Always allow?");expect(el.textContent).toContain("Agent-supplied description");
  expect([...el.querySelectorAll("button")].find(b=>b.textContent==="Confirm")).toBe(confirm);
  await act(async()=>confirm.click());expect(respond).toHaveBeenCalledExactlyOnceWith({optionId:"persist"});
});
it.each([['cancelled','决定前已取消'],['expired','决定前已过期']] as const)("renders %s approval as a translated read-only receipt",async(resolution,label)=>{
 const respond=vi.fn();const el=await mount(<ToolFallback.Approval approval={{id:"settled",resolution,prompt:"Agent prompt"}} respondToApproval={respond}/>);
 expect(el.textContent).toContain(label);expect(el.textContent).toContain("Agent prompt");expect(el.querySelectorAll("button")).toHaveLength(0);expect(respond).not.toHaveBeenCalled();
});
it("restores approval controls after failure and preserves the backend error",async()=>{
 const respond=vi.fn().mockRejectedValueOnce(new Error("raw backend $& error")).mockResolvedValueOnce(undefined);
 const el=await mount(<ToolFallback.Approval approval={{id:"retry"}} respondToApproval={respond} status={{type:"requires-action",reason:"tool-calls"}}/>);
 const allow=[...el.querySelectorAll("button")].find(b=>b.textContent==="允许")!;
 await act(async()=>allow.click());expect(el.querySelector('[role="alert"]')?.textContent).toBe("raw backend $& error");expect(allow.disabled).toBe(false);
 await act(async()=>allow.click());expect(respond.mock.calls).toEqual([[{approved:true}],[{approved:true}]]);
});
it.each([['zh-CN',"工具调用已取消","取消原因："],['en-US',"Cancelled tool","Cancelled reason:"]] as const)("preserves cancelled tool state and icons in %s",async(locale,label,errorHeading)=>{
 const el=await mount(<ToolFallback.Root><ToolFallback.Trigger toolName="original_tool" status={{type:"incomplete",reason:"cancelled"}}/><ToolFallback.Error status={{type:"incomplete",reason:"cancelled",error:"backend reason"}}/></ToolFallback.Root>,locale);
 expect(el.textContent).toContain(label);expect(el.textContent).toContain(errorHeading);expect(el.textContent).toContain("original_tool");expect(el.querySelector('[data-slot="tool-fallback-trigger-icon"]')).not.toBeNull();
});
