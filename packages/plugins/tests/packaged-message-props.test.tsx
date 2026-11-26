import { ToolCallCard as InternalCard } from "../src/plugins/tool-result/adapters/presentation/tool-call-card.js";
// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AssistantRuntimeProvider, MessagePrimitive, ThreadPrimitive, useLocalRuntime, type AssistantRuntime } from "@assistant-ui/react";
import { afterEach, expect, it, vi } from "vitest";
import { AgentUILocaleProvider, ConversationThread, ConversationToolResult, ConversationTransientMessageProvider, createConversationTransientMessageService } from "@za38.03/agent-ui-plugins";
import { ConversationToolResultPlugin } from "../dist/tool-result/index.js";
import { TransientAssistantMessagesPlugin } from "../dist/transient-assistant-messages/index.js";
import { ConversationTransientMessages as SourceTransientMessages } from "../dist/sources/takeover/transient-assistant-messages/adapters/transient-assistant-messages";
import { ToolCallCard as PortableFallback } from "../dist/sources/takeover/tool-result/adapters/tool-call-card";
const frameworkProps = { renderSlot: () => null, renderScopedSlot: () => null };
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root=undefined; document.body.replaceChildren(); });
async function mount(node: ReactNode) { const container=document.createElement("div"); document.body.append(container); root=createRoot(container); await act(async()=>root!.render(node)); return container; }

it("packaged fallback forwards application props, controlled disclosure and compound parts in the native tool context", async () => {
  const changed=vi.fn();
  function Host(){ const runtime=useLocalRuntime({async *run(){}},{initialMessages:[{id:"a",role:"assistant",content:[{type:"tool-call",toolCallId:"call",toolName:"unknown_tool",args:{q:"original"},result:{answer:42}}]}]});
    return <AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Root><ThreadPrimitive.Messages components={{UserMessage:()=>null,AssistantMessage:()=> <MessagePrimitive.Root><MessagePrimitive.Parts components={{tools:{Fallback:tool=><ConversationToolResultPlugin {...frameworkProps} tool={tool} expanded={true} onExpandedChange={changed} aria-label={"application-tool"} style={{padding:17}} buttonProps={{"aria-label":"application-trigger"}} argsProps={{"aria-label":"application-args"}} resultProps={{"aria-label":"application-result"}} renderToolCall={({header,defaultView})=><>{header}{defaultView}<span data-custom-child="">application child</span></>}/>}}}/></MessagePrimitive.Root>}}/></ThreadPrimitive.Root></AssistantRuntimeProvider>; }
  const container=await mount(<Host/>);
  expect(container.querySelector<HTMLElement>('[aria-label="application-tool"]')?.style.padding).toBe("17px");
  expect(container.querySelector('[aria-label="application-args"]')?.textContent).toContain("original");
  expect(container.querySelector('[aria-label="application-result"]')?.textContent).toContain("42");
  expect(container.querySelector('[data-custom-child]')?.textContent).toBe("application child");
  await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="application-trigger"]')!.click());
  expect(changed).toHaveBeenCalledWith(false);
  expect(container.querySelector('[aria-label="application-trigger"]')?.getAttribute("aria-expanded")).toBe("true");

  function CustomHost(){const runtime=useLocalRuntime({async *run(){}});return <AssistantRuntimeProvider runtime={runtime}><ConversationToolResultPlugin {...frameworkProps} tool={{toolCallId:"custom",toolName:"custom",args:{},status:{type:"complete"}}} expanded={true} buttonProps={{"aria-label":"custom trigger"}} renderToolCall={({header,defaultView})=> <>{header}{defaultView}<div data-custom-content="">custom content</div></>}/></AssistantRuntimeProvider>;}
  await act(async()=>root!.render(<CustomHost/>));expect(container.querySelector('[aria-label="custom trigger"]')).not.toBeNull();expect(container.querySelector("[data-custom-content]")?.textContent).toBe("custom content");
});

it.each([{name:"internal",Fallback:InternalCard},{name:"portable",Fallback:PortableFallback}])("$name fallback approval composition retains native callbacks, retry and localized queued state", async ({Fallback}) => {
  const respond=vi.fn().mockRejectedValueOnce(new Error("backend refusal")).mockResolvedValueOnce(undefined);
  function Host(){const runtime=useLocalRuntime({async *run(){}});return <AssistantRuntimeProvider runtime={runtime}><AgentUILocaleProvider locale="zh-CN"><Fallback.Root open><Fallback.Trigger toolName="tool" responseDeliveryStatus="queued"/><Fallback.Approval approval={{id:"request"}} status={{type:"requires-action",reason:"tool-calls"}} respondToApproval={respond}/></Fallback.Root></AgentUILocaleProvider></AssistantRuntimeProvider>;}
  const container=await mount(<Host/>);expect(container.textContent).toContain("回复已排队，尚未发送");
  const allow=[...container.querySelectorAll("button")].find(button=>button.textContent==="允许")!;
  await act(async()=>allow.click());expect(container.querySelector('[role="alert"]')?.textContent).toBe("backend refusal");expect(allow.disabled).toBe(false);
  await act(async()=>allow.click());expect(respond.mock.calls).toEqual([[{approved:true}],[{approved:true}]]);
});

it("npm and extracted presentation share one transient store and preserve application renderers without sending messages", async () => {
  const service=createConversationTransientMessageService();let runtime!:AssistantRuntime;const run=vi.fn();
  let custom=false;
  function Host(){runtime=useLocalRuntime({async *run(){run();}});return <AssistantRuntimeProvider runtime={runtime}><AgentUILocaleProvider locale="zh-CN"><ConversationTransientMessageProvider service={service} conversationId="A"><TransientAssistantMessagesPlugin {...frameworkProps} aria-label={"application-notice"} style={{padding:19}} styles={{text:{fontWeight:700}}} {...(custom?{renderMessage:(message:{text:string})=><aside data-custom-message="">{message.text}</aside>}: {})}/><SourceTransientMessages afterMessageId={null}/></ConversationTransientMessageProvider></AgentUILocaleProvider></AssistantRuntimeProvider>;}
  const container=await mount(<Host/>);
  await act(async()=>{service.addMessage({role:"assistant",type:"error",text:"local notice"});});
  expect(container.querySelectorAll('[data-slot="transient-message"]')).toHaveLength(2);
  expect(container.querySelector<HTMLElement>('[aria-label="application-notice"]')?.style.padding).toBe("19px");
  expect(container.querySelector<HTMLElement>('[aria-label="application-notice"] p')?.style.fontWeight).toBe("700");
  expect(container.querySelector('[aria-label="application-notice"]')?.getAttribute("role")).toBe("alert");
  custom=true;await act(async()=>root!.render(<Host/>));
  expect(container.querySelector('[data-custom-message]')?.textContent).toBe("local notice");
  expect(service.getSnapshot("A")).toHaveLength(1);expect(runtime.thread.getState().messages).toHaveLength(0);expect(run).not.toHaveBeenCalled();
});
