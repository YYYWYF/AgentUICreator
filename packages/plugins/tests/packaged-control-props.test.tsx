// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AssistantRuntimeProvider, useLocalRuntime, type AssistantRuntime, type DictationAdapter } from "@assistant-ui/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConversationCanonicalComposer, ConversationThread, AgentUILocaleProvider } from "@za38.03/agent-ui-plugins";
import { ConversationRuntimeProvider } from "@za38.03/agent-ui-runtime";
import { ConversationAddAttachmentActionPlugin } from "../dist/add-attachment-action/index.js";
import { ConversationDictationActionPlugin } from "../dist/dictation-action/index.js";
import { ConversationSubmitActionPlugin } from "../dist/submit-action/index.js";
import { ConversationResponseFooterPlugin } from "../dist/response-footer/index.js";
import { ConversationSuggestionsPlugin } from "../dist/conversation-suggestions/index.js";
import { ConversationThinkingIndicatorPlugin } from "../dist/thinking-indicator/index.js";
import { ConversationToolTimelinePlugin } from "../dist/tool-timeline/index.js";
const frameworkProps = { renderSlot: () => null, renderScopedSlot: () => null };
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(async () => { await act(async()=>root?.unmount());root=undefined;document.body.replaceChildren();vi.restoreAllMocks(); });
async function mount(node: React.ReactNode) {const container=document.createElement("div");document.body.append(container);root=createRoot(container);await act(async()=>root!.render(node));return container;}

it("packaged composer actions retain native send/cancel, dictation and attachment behavior with application props",async()=>{
  let runtime!:AssistantRuntime, runs=0, prevent=true;
  const sendClick=vi.fn((event:React.MouseEvent)=>{if(prevent)event.preventDefault();});
  const stop=vi.fn(async()=>{});
  const session: DictationAdapter.Session={status:{type:"running"},stop,cancel:vi.fn(),onSpeechStart:()=>()=>{},onSpeechEnd:()=>()=>{},onSpeech:()=>()=>{}};
  const listen=vi.fn(()=>session);
  const inputClick=vi.spyOn(HTMLInputElement.prototype,"click").mockImplementation(()=>{});
  function Host(){runtime=useLocalRuntime({async *run({abortSignal}){runs++;yield {content:[{type:"text",text:"running"}]};await new Promise<void>(resolve=>abortSignal.addEventListener("abort",()=>resolve(),{once:true}));}},{adapters:{dictation:{listen},attachments:{accept:"text/plain",async add(){throw Error("No file selected");},async remove(){},async send(){throw Error("No file selected");}}}});return <AgentUILocaleProvider locale="zh-CN"><AssistantRuntimeProvider runtime={runtime}><ConversationCanonicalComposer
    leadingActions={<ConversationAddAttachmentActionPlugin {...frameworkProps} aria-label="application-attach" style={{padding:9}}/>}
    trailingActions={<ConversationDictationActionPlugin {...frameworkProps} dictateProps={{"aria-label":"application-dictate",style:{padding:11}}} stopProps={{"aria-label":"application-stop-dictation"}}/>}
    submitAction={<ConversationSubmitActionPlugin {...frameworkProps} sendProps={{"aria-label":"application-send",style:{padding:13},onClick:sendClick}} cancelProps={{"aria-label":"application-cancel"}}/>}/></AssistantRuntimeProvider></AgentUILocaleProvider>;}
  const container=await mount(<Host/>);
  const attach=container.querySelector<HTMLButtonElement>('[aria-label="application-attach"]')!;expect(attach.style.padding).toBe("9px");await act(async()=>attach.click());expect(inputClick).toHaveBeenCalledOnce();
  const dictate=container.querySelector<HTMLButtonElement>('[aria-label="application-dictate"]')!;expect(dictate.style.padding).toBe("11px");await act(async()=>dictate.click());expect(listen).toHaveBeenCalledOnce();
  await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="application-stop-dictation"]')!.click());expect(stop).toHaveBeenCalledOnce();
  await act(async()=>runtime.thread.composer.setText("preserved application draft"));
  const send=container.querySelector<HTMLButtonElement>('[aria-label="application-send"]')!;expect(send.style.padding).toBe("13px");await act(async()=>send.click());expect(sendClick).toHaveBeenCalledOnce();expect(runs).toBe(0);expect(runtime.thread.composer.getState().text).toBe("preserved application draft");
  prevent=false;await act(async()=>send.click());expect(runs).toBe(1);
  await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="application-cancel"]')!.click());expect(runtime.thread.getState().isRunning).toBe(false);
});

it("response footer preserves semantic actions and forwards root/action-bar/branch props",async()=>{
  function Footer(){return <ConversationResponseFooterPlugin {...frameworkProps} renderSlot={()=> <button data-testid="preserved-action">custom</button>} rootProps={{"aria-label":"application-footer",style:{padding:9}}} actionBarProps={{autohide:"never","aria-label":"application-action-bar"}} branchPickerProps={{hideWhenSingleBranch:false,"aria-label":"application-branch",style:{padding:7}}}/>;}
  function Host(){const runtime=useLocalRuntime({async *run(){}},{initialMessages:[{id:"u",role:"user",content:[{type:"text",text:"question"}]},{id:"a",role:"assistant",content:[{type:"text",text:"answer"}]}]});return <AssistantRuntimeProvider runtime={runtime}><ConversationThread components={{AssistantResponseFooter:Footer}} composer={null}/></AssistantRuntimeProvider>;}
  const container=await mount(<Host/>);expect(container.querySelector<HTMLElement>('[aria-label="application-footer"]')!.style.padding).toBe("9px");expect(container.querySelector('[aria-label="application-action-bar"] [data-testid="preserved-action"]')).not.toBeNull();expect(container.querySelector<HTMLElement>('[aria-label="application-branch"]')!.style.padding).toBe("7px");
});

it("suggestion props retain native scoped text and clearComposer/send behavior",async()=>{
  const clicked=vi.fn();
  const container=await mount(<ConversationRuntimeProvider endpoint="http://example.test/unused" threadBinding={{getThreadId:()=>"suggestion-test",subscribe:()=>()=>{},createNewThread:async()=>"suggestion-new"}} suggestions={[{title:"First",label:"description",prompt:"suggested application draft"}]}><ConversationSuggestionsPlugin {...frameworkProps} rootProps={{style:{padding:11}}} triggerProps={{send:false,"aria-label":"application-suggestion",onClick:clicked}} titleProps={{style:{fontWeight:700}}}/><ConversationCanonicalComposer inputAriaLabel="suggestion-input"/></ConversationRuntimeProvider>);
  const suggestion=container.querySelector<HTMLButtonElement>('[aria-label="application-suggestion"]')!;expect(suggestion.textContent).toContain("First");expect(suggestion.textContent).toContain("description");expect(container.querySelector<HTMLElement>('.conversation-suggestions-plugin')!.style.padding).toBe("11px");await act(async()=>suggestion.click());expect(clicked).toHaveBeenCalledOnce();expect(container.querySelector<HTMLTextAreaElement>('textarea[aria-label="suggestion-input"]')!.value).toBe("suggested application draft");
});

it("tool timeline forwards controlled disclosure, details composition and native presentation props",async()=>{
  function Host(){const runtime=useLocalRuntime({async *run(){}},{initialMessages:[{id:"a",role:"assistant",content:[{type:"tool-call",toolCallId:"t1",toolName:"read_file",args:{},argsText:"{}",result:{ok:true}}]}]});return <AssistantRuntimeProvider runtime={runtime}><ConversationThread composer={null} components={{ToolTimeline:props=><ConversationToolTimelinePlugin {...frameworkProps} {...props} rootProps={{style:{padding:17}}} timelineProps={{open:true,restingLabel:"application-summary"}} defaultDetailsOpen={true} detailsProps={{onOpenChange:(_value,event)=>event.cancel()}} detailsTriggerProps={{"aria-label":"application-details"}}/>}}/></AssistantRuntimeProvider>;}
  const container=await mount(<Host/>);expect(container.querySelector<HTMLElement>('[data-slot="agent-ui-tool-timeline"]')!.style.padding).toBe("17px");expect(container.textContent).toContain("application-summary");expect(container.querySelector('[aria-label="application-details"]')).not.toBeNull();expect(container.querySelector('[data-slot="tool-fallback-root"]')).not.toBeNull();const trigger=container.querySelector<HTMLButtonElement>('[aria-label="application-details"]')!;await act(async()=>trigger.click());expect(trigger.getAttribute("aria-expanded")).toBe("true");
});

it("thinking indicator receives scope policy and presentation props without creating another Runtime",async()=>{
  let runtime!:AssistantRuntime;
  function Host(){runtime=useLocalRuntime({async *run({abortSignal}){yield {content:[{type:"reasoning",text:""}]};await new Promise<void>(resolve=>abortSignal.addEventListener("abort",()=>resolve(),{once:true}));}});return <AssistantRuntimeProvider runtime={runtime}><ConversationThread composer={null} components={{reasoningVisible:false,ThinkingIndicator:props=><ConversationThinkingIndicatorPlugin {...frameworkProps} {...props} indicatorProps={{label:"application-thinking","aria-label":"application-thinking",style:{padding:19}}}/>}}/></AssistantRuntimeProvider>;}
  const container=await mount(<Host/>);await act(async()=>{runtime.thread.composer.setText("request");runtime.thread.composer.send();});expect(container.querySelector<HTMLElement>('[aria-label="application-thinking"]')!.style.padding).toBe("19px");expect(container.textContent).toContain("application-thinking");await act(async()=>runtime.thread.cancelRun());
});
