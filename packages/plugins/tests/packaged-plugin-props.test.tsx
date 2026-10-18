// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { AssistantRuntimeProvider, useLocalRuntime } from "@assistant-ui/react";
import { expect, it, vi } from "vitest";
import { ConversationThread, AgentUILocaleProvider, type ConversationMessagePartGroup } from "@za38.03/agent-ui-plugins";
import { ConversationCopyActionPlugin } from "../dist/copy-action/index.js";
import { ConversationReloadActionPlugin } from "../dist/reload-action/index.js";
import { ConversationFeedbackActionsPlugin } from "../dist/feedback-actions/index.js";
import { ConversationExportMarkdownActionPlugin } from "../dist/export-markdown-action/index.js";
import { ConversationReasoningPlugin } from "../dist/reasoning/index.js";
import { ConversationToolGroupPlugin } from "../dist/tool-group/index.js";
const frameworkProps={renderSlot:()=>null,renderScopedSlot:()=>null};
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
it("packaged actions share the response Runtime and forward props/events without losing locale or behavior",async()=>{
  const copied=vi.fn(async()=>{}), clicked=vi.fn(), feedback=vi.fn(), run=vi.fn(), exported=vi.fn();
  Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:copied}});
  function Footer(){return <>
    <ConversationCopyActionPlugin {...frameworkProps} aria-label="application-copy" style={{padding:9}} onClick={clicked}/>
    <ConversationReloadActionPlugin {...frameworkProps} aria-label="application-reload" onClick={event=>event.preventDefault()}/>
    <ConversationFeedbackActionsPlugin {...frameworkProps} positiveProps={{"aria-label":"application-feedback",style:{padding:7}}}/>
    <ConversationExportMarkdownActionPlugin {...frameworkProps} menuLabel="application-export" menuItemProps={{style:{padding:17},onSelect:event=>{exported();event.preventDefault();}}}/>
  </>;}
  function Host(){const runtime=useLocalRuntime({async *run(){run();}},{adapters:{feedback:{submit:feedback}},initialMessages:[{id:"u",role:"user",content:[{type:"text",text:"question"}]},{id:"answer",role:"assistant",content:[{type:"text",text:"response text"}]}]});return <AgentUILocaleProvider locale="zh-CN"><AssistantRuntimeProvider runtime={runtime}><ConversationThread components={{AssistantResponseFooter:Footer}} composer={null}/></AssistantRuntimeProvider></AgentUILocaleProvider>;}
  const element=document.createElement("div");document.body.append(element);const root=createRoot(element);
  try{await act(async()=>root.render(<Host/>));const button=element.querySelector<HTMLButtonElement>('[aria-label="application-copy"]')!;expect(button.style.padding).toBe("9px");await act(async()=>button.click());expect(clicked).toHaveBeenCalledOnce();expect(copied).toHaveBeenCalledWith("response text");expect(button.getAttribute("data-copied")).toBe("true");
    await act(async()=>element.querySelector<HTMLButtonElement>('[aria-label="application-reload"]')!.click());expect(run).not.toHaveBeenCalled();
    const positive=element.querySelector<HTMLButtonElement>('[aria-label="application-feedback"]')!;expect(positive.style.padding).toBe("7px");await act(async()=>positive.click());expect(feedback).toHaveBeenCalledWith(expect.objectContaining({type:"positive",message:expect.objectContaining({id:"answer"})}));
    await act(async()=>{const more=element.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!;more.focus();more.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowDown",bubbles:true}));});
    const menu=document.querySelector<HTMLElement>('[role="menuitem"]')!;expect(menu.textContent).toContain("application-export");expect(menu.style.padding).toBe("17px");await act(async()=>menu.click());expect(exported).toHaveBeenCalledOnce();
  }finally{await act(async()=>root.unmount());element.remove();}
});
it("packaged reasoning and tool group preserve native disclosure props and composed children",async()=>{
  const group:ConversationMessagePartGroup={type:"group-reasoning",indices:[0],status:{type:"complete"}};
  function Host(){const runtime=useLocalRuntime({async *run(){}});return <AssistantRuntimeProvider runtime={runtime}>
    <ConversationReasoningPlugin {...frameworkProps} group={group} rootProps={{open:true,variant:"muted",style:{padding:11}}} triggerProps={{"aria-label":"reasoning-toggle"}}>custom reasoning</ConversationReasoningPlugin>
    <ConversationToolGroupPlugin {...frameworkProps} group={{...group,type:"group-tool"}} rootProps={{open:true,variant:"outline",style:{padding:13}}} triggerProps={{"aria-label":"tools-toggle"}}>custom tools</ConversationToolGroupPlugin>
  </AssistantRuntimeProvider>;}
  const element=document.createElement("div");document.body.append(element);const root=createRoot(element);
  try{await act(async()=>root.render(<Host/>));expect(element.querySelector<HTMLElement>('[data-slot="reasoning-root"]')!.style.padding).toBe("11px");expect(element.querySelector<HTMLElement>('[data-slot="tool-group-root"]')!.style.padding).toBe("13px");expect(element.textContent).toContain("custom reasoning");expect(element.textContent).toContain("custom tools");expect(element.querySelector('[aria-label="reasoning-toggle"]')).not.toBeNull();expect(element.querySelector('[aria-label="tools-toggle"]')).not.toBeNull();}finally{await act(async()=>root.unmount());element.remove();}
});
