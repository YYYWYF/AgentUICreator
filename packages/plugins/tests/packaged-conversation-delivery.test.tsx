// @vitest-environment jsdom
import { act, useState, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAui, type AssistantRuntime } from "@assistant-ui/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConversationRuntimeProvider, type ConversationThreadBinding } from "@za38.03/agent-ui-runtime";
import { AgentUIRoot, AgentUILocaleProvider, type AgentUILocaleCode, type AgentUILocaleOverrides } from "@za38.03/agent-ui-plugins";
import listDefinition, { ConversationThreadListPlugin, ConversationThreadListRailAction } from "../dist/conversation-thread-list/index.js";
import historyDefinition, { ConversationHistoryPlugin } from "../dist/conversation-history/index.js";
import newDefinition, { ConversationNewPlugin } from "../dist/conversation-new/index.js";
import quoteDefinition, { ConversationQuotePlugin } from "../dist/conversation-quote/index.js";
import { ConversationThreadListPlugin as SourceList, ConversationThreadListRailAction as SourceRail } from "../dist/sources/takeover/conversation-thread-list/index";
import { ConversationHistoryPlugin as SourceHistory } from "../dist/sources/takeover/conversation-history/index";
import { ConversationNewPlugin as SourceNew } from "../dist/sources/takeover/conversation-new/index";
import { ConversationQuotePlugin as SourceQuote } from "../dist/sources/takeover/conversation-quote/index";
const modes=[{name:"npm",List:ConversationThreadListPlugin,Rail:ConversationThreadListRailAction,History:ConversationHistoryPlugin,New:ConversationNewPlugin,Quote:ConversationQuotePlugin},{name:"portable",List:SourceList,Rail:SourceRail,History:SourceHistory,New:SourceNew,Quote:SourceQuote}];
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root|undefined;
afterEach(async()=>{await act(async()=>root?.unmount());root=undefined;document.body.replaceChildren();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function until(predicate:()=>boolean){for(let i=0;i<100&&!predicate();i++)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,5));});expect(predicate()).toBe(true);}
async function mount(content:ReactNode,locale:AgentUILocaleCode="en-US",messages?:AgentUILocaleOverrides){
  vi.stubGlobal("ResizeObserver",class{observe(){} unobserve(){} disconnect(){}});
  Object.defineProperty(HTMLElement.prototype,"scrollTo",{configurable:true,value(){}});
  let active="history";let runtime!:AssistantRuntime;let next=0;
  const load=vi.fn(async(id:string)=>({messages:[{id:`message-${id}`,role:"assistant" as const,content:[{type:"text" as const,text:`Loaded ${id}`}],createdAt:new Date(0),status:{type:"complete" as const,reason:"stop" as const},metadata:{custom:{}}}]}));
  const create=vi.fn(async()=>`new-${++next}`);
  const binding:ConversationThreadBinding={getThreadId:()=>active,activateThread:id=>{active=id;},subscribe:()=>()=>{},loadThread:load,createNewThread:create,getThreadListSnapshot:()=>({isLoading:false,threads:[{id:"history",status:"regular",title:"First history"},{id:"other",status:"regular",title:"Second history"},{id:"blocked",status:"regular",title:"Blocked history",custom:{agentUiDisabled:true}}],archivedThreads:[]})};
  function Capture(){runtime=useAui().threads.__internal_getAssistantRuntime!();return null;}
  const host=document.createElement("div");document.body.append(host);root=createRoot(host);
  const render=(children:ReactNode,lang=locale,overrides=messages)=>root!.render(<ConversationRuntimeProvider endpoint="http://example.test/agent" threadBinding={binding}><AgentUIRoot theme="light"><AgentUILocaleProvider locale={lang} messages={overrides}><Capture/>{children}</AgentUILocaleProvider></AgentUIRoot></ConversationRuntimeProvider>);
  await act(async()=>render(content));await until(()=>!!runtime&&!runtime.thread.getState().isLoading);
  return {host,load,create,get runtime(){return runtime;},render:async(children:ReactNode,lang=locale,overrides=messages)=>{await act(async()=>render(children,lang,overrides));}};
}
it("preserves conversation service admission, history Slot and the rail action in npm metadata",()=>{
  expect(listDefinition.inject).toEqual(["agent-ui.conversations"]);expect(listDefinition.optionalInject).toEqual(["agent-ui.theme","agent-ui.locale"]);expect(listDefinition.RailAction).toBe(ConversationThreadListRailAction);
  expect(historyDefinition.inject).toEqual(["agent-ui.conversations"]);expect(historyDefinition.manifest.slots?.children?.content).toMatchObject({optional:true,accepts:{anyOfCapabilities:["conversation-history"]}});
  expect(newDefinition.manifest.id).toBe("conversation-new");expect(quoteDefinition.optionalInject).toEqual(["agent-ui.locale"]);
});
it.each(modes)("$name list forwards props, retains selection/search policies, and uses canonical navigation",async({List})=>{
  const el=await mount(<List rootProps={{"aria-label":"custom list",style:{padding:19},className:"kept"}} listProps={{newProps:{children:"Custom new"},searchProps:{"aria-label":"custom search"},itemProps:{actions:{rename:true,archive:true,delete:false}}}}/>);
  await until(()=>el.host.textContent!.includes("Second history"));expect(el.host.querySelector<HTMLElement>('[aria-label="custom list"]')?.style.padding).toBe("19px");expect(el.host.querySelector('[aria-label="custom list"]')?.classList.contains("conversation-thread-list-plugin")).toBe(true);
  const other=[...el.host.querySelectorAll<HTMLButtonElement>('[data-slot="aui_thread-list-item-trigger"]')].find(button=>button.textContent?.includes("Second history"))!;
  await act(async()=>other.click());await until(()=>el.runtime.threads.getState().mainThreadId==="other");expect(el.load).toHaveBeenCalledWith("other");
  const blocked=[...el.host.querySelectorAll<HTMLElement>('[data-slot="aui_thread-list-item-trigger"]')].find(button=>button.textContent?.includes("Blocked history"))!;expect(blocked.closest('[aria-disabled="true"]')?.hasAttribute("inert")).toBe(true);
  expect(el.host.querySelector('[aria-label="custom search"]')).not.toBeNull();expect(el.host.textContent).toContain("Custom new");
  await el.render(<List listProps={{searchProps:{value:"Second",onValueChange:vi.fn()}}}/>);expect(el.host.textContent).toContain("Second history");expect(el.host.textContent).not.toContain("First history");
  await el.render(<List listProps={{components:{ThreadListItem:()=> <span>Custom row</span>}}}/>);expect(el.host.textContent).toContain("Custom row");
});
it.each(modes)("$name list retains service refresh and failed history retry including disabled admission",async({List})=>{
  const refresh=vi.fn(async()=>{});const props:ComponentProps<typeof List>={serviceAvailable:true,onRefresh:refresh,snapshot:{listStatus:"error",detailStatus:"error",listError:"Network list",detailError:"Network history",detailErrorConversationId:"other",activeConversationId:"history"},children:<span>Custom body</span>};
  const el=await mount(<List {...props}/>);expect(el.host.querySelectorAll('[role="alert"]')).toHaveLength(2);expect(el.host.textContent).toContain("Network list");expect(el.host.textContent).toContain("Custom body");
  const retries=el.host.querySelectorAll<HTMLButtonElement>('[role="alert"] button');await act(async()=>retries[0]!.click());expect(refresh).toHaveBeenCalledOnce();await act(async()=>retries[1]!.click());await until(()=>el.runtime.threads.getState().mainThreadId==="other");
  const before=el.load.mock.calls.length;await el.render(<List {...props} snapshot={{...props.snapshot,activeConversationId:"other"}}/>);await act(async()=>el.host.querySelectorAll<HTMLButtonElement>('[role="alert"] button')[1]!.click());await until(()=>el.load.mock.calls.length>before);
  await el.render(<List {...props} serviceAvailable={false}/>);for(const button of el.host.querySelectorAll<HTMLButtonElement>('[role="alert"] button'))expect(button.disabled).toBe(true);
});
it.each(modes)("$name new and rail retain canonical new-thread behavior and respect prevented clicks",async({New,Rail})=>{
  const prevent=vi.fn((event:React.MouseEvent<HTMLButtonElement>)=>event.preventDefault());const el=await mount(<New newProps={{"aria-label":"custom new",onClick:prevent,style:{padding:13},children:"Make new"}}/>);
  const button=el.host.querySelector<HTMLButtonElement>('[aria-label="custom new"]')!;expect(button.style.padding).toBe("13px");await act(async()=>button.click());expect(prevent).toHaveBeenCalledOnce();expect(el.create).not.toHaveBeenCalled();
  await el.render(<New newProps={{"aria-label":"create"}}/>);await act(async()=>el.host.querySelector<HTMLButtonElement>('[aria-label="create"]')!.click());await until(()=>el.runtime.threads.getState().mainThreadId!=="history");
  await act(async()=>el.runtime.threads.switchToThread("history"));
  await el.render(<Rail enabled={false}/>);expect(el.host.querySelector('[data-slot="aui_thread-list-new"]')).toBeNull();
  await el.render(<Rail enabled newProps={{"aria-label":"rail new",children:"Rail new"}}/>);await act(async()=>el.host.querySelector<HTMLButtonElement>('[aria-label="rail new"]')!.click());await until(()=>el.runtime.threads.getState().mainThreadId!=="history");
});
it.each(modes)("$name history forwards trigger/content/popover props, renders semantic content, closes on thread change",async({History})=>{
  const slots=vi.fn((name:string)=> <p>{name}: actual child</p>);const changed=vi.fn();const el=await mount(<History activeConversationId="history" renderSlot={slots} rootProps={{"aria-label":"history root"}} triggerProps={{"aria-label":"open history",children:"Open"}} contentProps={{"aria-label":"custom history",style:{padding:25}}} popoverProps={{onOpenChange:changed}}/>);
  await act(async()=>el.host.querySelector<HTMLButtonElement>('[aria-label="open history"]')!.click());await until(()=>el.host.textContent!.includes("actual child"));expect(slots).toHaveBeenCalledWith("content",expect.anything());expect(el.host.querySelector<HTMLElement>('[aria-label="custom history"]')?.style.padding).toBe("25px");expect(changed.mock.calls[0]?.[0]).toBe(true);
  await el.render(<History activeConversationId="other" renderSlot={slots} triggerProps={{"aria-label":"open history"}} popoverProps={{onOpenChange:changed}}/>);await until(()=>el.host.querySelector('[aria-label="open history"]')?.getAttribute("aria-expanded")==="false");expect(changed.mock.calls.at(-1)?.[0]).toBe(false);
});
it.each(modes)("$name history supports controlled open, defaultOpen and composition",async({History})=>{
  function Controlled({id}:{id:string}){const [open,setOpen]=useState(true);return <History activeConversationId={id} popoverProps={{open,onOpenChange:setOpen}} triggerProps={{"aria-label":"history"}}>Custom composed content</History>;}
  const el=await mount(<Controlled id="one"/>);expect(el.host.textContent).toContain("Custom composed content");await el.render(<Controlled id="two"/>);await until(()=>el.host.querySelector('[aria-label="history"]')?.getAttribute("aria-expanded")==="false");
  await el.render(<History popoverProps={{defaultOpen:true}}><p>Default opened</p></History>);expect(el.host.textContent).toContain("Default opened");
});
it.each(modes)("$name history respects a cancelled native open-change event",async({History})=>{
  const changed=vi.fn((_open:boolean,event:{cancel:()=>void})=>event.cancel());const el=await mount(<History triggerProps={{"aria-label":"cancel open"}} popoverProps={{onOpenChange:changed}}>Cancelled content</History>);
  await act(async()=>el.host.querySelector<HTMLButtonElement>('[aria-label="cancel open"]')!.click());expect(changed).toHaveBeenCalledOnce();expect(el.host.querySelector('[aria-label="cancel open"]')?.getAttribute("aria-expanded")).toBe("false");expect(el.host.textContent).not.toContain("Cancelled content");
});
it.each(modes)("$name quote exposes renderers/props and follows locale with Host overrides",async({Quote,History})=>{
  const preview=vi.fn((props:ComponentProps<typeof Quote>["previewProps"])=><span>{props?.dismissLabel}</span>);const toolbar=vi.fn((props:ComponentProps<typeof Quote>["toolbarProps"])=><span>{props?.quoteLabel}</span>);
  const el=await mount(<><Quote renderPreview={preview} renderToolbar={toolbar}/><History/></>,"zh-CN");expect(el.host.textContent).toContain("取消引用");expect(el.host.textContent).toContain("引用");expect(el.host.querySelector('[aria-label="历史会话"]')).not.toBeNull();
  await el.render(<Quote renderPreview={preview} renderToolbar={toolbar}/>,"en-US",{conversationQuote:{dismiss:"Host dismiss",quote:"Host quote"}});expect(el.host.textContent).toBe("Host dismissHost quote");await el.render(<Quote renderPreview={preview} renderToolbar={toolbar} previewProps={{dismissLabel:"Local dismiss"}} toolbarProps={{quoteLabel:"Local quote"}}/>);expect(el.host.textContent).toBe("Local dismissLocal quote");
});
