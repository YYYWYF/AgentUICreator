// @vitest-environment jsdom
import * as React from "react";
import * as JSXRuntime from "react/jsx-runtime";
import { act, type ComponentProps, type ComponentType, type ReactNode } from "react";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { createRoot, type Root } from "react-dom/client";
import { useAui, useAuiState, type AssistantRuntime } from "@assistant-ui/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConversationRuntimeProvider, type ConversationThreadBinding } from "@za38.03/agent-ui-runtime";
import { AgentUIRoot, AgentUILocaleProvider, type AgentUILocaleCode, type AgentUILocaleOverrides } from "@za38.03/agent-ui-plugins";
import * as Plugins from "@za38.03/agent-ui-plugins";
import * as PluginSupport from "@za38.03/agent-ui-plugins/plugin-support";
import listDefinition, { ConversationThreadListPlugin, ConversationThreadListRailAction } from "../dist/conversation-thread-list/index.js";
import newDefinition, { ConversationNewPlugin } from "../dist/conversation-new/index.js";
import quoteDefinition, { ConversationQuotePlugin } from "../dist/conversation-quote/index.js";
import { ConversationThreadListPlugin as SourceList, ConversationThreadListRailAction as SourceRail } from "../dist/sources/takeover/conversation-thread-list/index";
import { ConversationNewPlugin as SourceNew } from "../dist/sources/takeover/conversation-new/index";
import { ConversationQuotePlugin as SourceQuote } from "../dist/sources/takeover/conversation-quote/index";
const modes=[{name:"npm",List:ConversationThreadListPlugin,Rail:ConversationThreadListRailAction,New:ConversationNewPlugin,Quote:ConversationQuotePlugin},{name:"portable",List:SourceList,Rail:SourceRail,New:SourceNew,Quote:SourceQuote}];
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
it("preserves conversation service admission and independent new-thread actions",()=>{
  expect(listDefinition.inject).toEqual(["agent-ui.conversations"]);expect(listDefinition.optionalInject).toEqual(["agent-ui.theme","agent-ui.locale"]);expect(listDefinition.RailAction).toBeUndefined();expect(listDefinition.manifest.capabilities).not.toContain("conversation-create");
  expect(newDefinition.manifest.id).toBe("conversation-new");expect(quoteDefinition.optionalInject).toEqual(["agent-ui.locale"]);
});
// Execute the real initialized application template, replacing only its Host imports.
// The popover, list, locale and canonical conversation Runtime are the actual implementations.
async function assistantListApplication() {
  const source = await readFile(new URL("../src/plugins/conversation-thread-list/adapters/application/assistant/index.tsx", import.meta.url), "utf8");
  // Compile outside jsdom so esbuild receives Node's matching TextEncoder/Uint8Array realm.
  const compiler = createRequire(import.meta.url).resolve("esbuild");
  const code = execFileSync(process.execPath, ["-e",
    'const {transformSync}=require(process.argv[1]);const source=require("node:fs").readFileSync(0,"utf8");process.stdout.write(transformSync(source,{loader:"tsx",format:"cjs",jsx:"automatic"}).code);',
    compiler,
  ], { input: source, encoding: "utf8" });
  const service = { refresh: vi.fn(async () => {}) };
  const modules: Record<string, unknown> = {
    "react": React,
    "react/jsx-runtime": JSXRuntime,
    "@za38.03/agent-ui-plugins": Plugins,
    "@za38.03/agent-ui-plugins/plugin-support": PluginSupport,
    "../../runtime/plugins": {
      usePluginService: () => service,
      usePluginServiceSnapshot: () => ({ activeConversationId: useAuiState(state => state.threads.mainThreadId) }),
    },
    "../../services/conversations": { AGENT_UI_CONVERSATION_SERVICE: "agent-ui.conversations", EMPTY_CONVERSATION_SNAPSHOT: {} },
    "../../agent-ui/theme/useAgentUITheme": { useAgentUITheme: () => "light" },
    "../../runtime/context": { useAgentRun: () => ({ status: "idle" }) },
    "./assistant.css": {},
  };
  const output = { exports: {} };
  new Function("require", "module", "exports", code)((name: string) => {
    if (!(name in modules)) throw new Error(`Unexpected application import: ${name}`);
    return modules[name];
  }, output, output.exports);
  return (output.exports as { ConversationThreadListPlugin: ComponentType<ComponentProps<typeof ConversationThreadListPlugin>> }).ConversationThreadListPlugin;
}
it.each(["en-US", "zh-CN"] as const)("%s application list retains its popover, search and close-on-selection", async locale => {
  const ApplicationList = await assistantListApplication();
  const el = await mount(<ApplicationList listProps={{searchProps:{value:"Second"}}}/>, locale);
  const trigger = () => el.host.querySelector<HTMLButtonElement>(".conversation-thread-list-popover-trigger")!;
  expect(trigger().getAttribute("aria-label")).toBe(locale === "zh-CN" ? "历史会话" : "Conversation history");
  await act(async () => trigger().click());
  await until(() => trigger().getAttribute("aria-expanded") === "true");
  expect(el.host.textContent).toContain("Second history");
  expect(el.host.textContent).not.toContain("First history");
  expect(el.host.querySelector(".conversation-thread-list-popover input")).not.toBeNull();
  await el.render(<ApplicationList listProps={{showSearch:false,searchProps:{value:"Second"}}}/>);
  expect(el.host.querySelector(".conversation-thread-list-popover input")).toBeNull();
  expect(el.host.textContent).toContain("First history");
  const other = [...el.host.querySelectorAll<HTMLButtonElement>('[data-slot="aui_thread-list-item-trigger"]')].find(button => button.textContent?.includes("Second history"))!;
  await act(async () => other.click());
  await until(() => el.runtime.threads.getState().mainThreadId === "other");
  await until(() => trigger().getAttribute("aria-expanded") === "false");
  expect(el.load).toHaveBeenCalledWith("other");
});
it.each(modes)("$name list forwards props, retains selection/search policies, and uses canonical navigation",async({List})=>{
  const el=await mount(<List rootProps={{"aria-label":"custom list",style:{padding:19},className:"kept"}} listProps={{searchProps:{"aria-label":"custom search"},itemProps:{actions:{rename:true,archive:true,delete:false}}}}/>);
  await until(()=>el.host.textContent!.includes("Second history"));expect(el.host.querySelector<HTMLElement>('[aria-label="custom list"]')?.style.padding).toBe("19px");expect(el.host.querySelector('[aria-label="custom list"]')?.classList.contains("conversation-thread-list-plugin")).toBe(true);
  const other=[...el.host.querySelectorAll<HTMLButtonElement>('[data-slot="aui_thread-list-item-trigger"]')].find(button=>button.textContent?.includes("Second history"))!;
  await act(async()=>other.click());await until(()=>el.runtime.threads.getState().mainThreadId==="other");expect(el.load).toHaveBeenCalledWith("other");
  const blocked=[...el.host.querySelectorAll<HTMLElement>('[data-slot="aui_thread-list-item-trigger"]')].find(button=>button.textContent?.includes("Blocked history"))!;expect(blocked.closest('[aria-disabled="true"]')?.hasAttribute("inert")).toBe(true);
  expect(el.host.querySelector('[aria-label="custom search"]')).not.toBeNull();expect(el.host.querySelector('[data-slot="aui_thread-list-new"]')).toBeNull();
  await el.render(<List listProps={{searchProps:{value:"Second",onValueChange:vi.fn()}}}/>);expect(el.host.textContent).toContain("Second history");expect(el.host.textContent).not.toContain("First history");
  await el.render(<List listProps={{components:{ThreadListItem:()=> <span>Custom row</span>}}}/>);expect(el.host.textContent).toContain("Custom row");
});
it.each(modes)("$name list can disable search without filtering or adding a new-thread button",async({List})=>{
  const el=await mount(<List listProps={{searchProps:{value:"Second"}}}/>);
  await until(()=>el.host.textContent!.includes("Second history"));
  expect(el.host.textContent).not.toContain("First history");
  await el.render(<List listProps={{showSearch:false,searchProps:{value:"Second"}}}/>);
  expect(el.host.querySelector('input')).toBeNull();
  expect(el.host.textContent).toContain("First history");
  expect(el.host.textContent).toContain("Second history");
  expect(el.host.querySelector('[data-slot="aui_thread-list-new"]')).toBeNull();
  await el.render(<List listProps={{showSearch:true,searchProps:{value:"Second"}}}/>);
  expect(el.host.querySelector('input')).not.toBeNull();
  expect(el.host.textContent).not.toContain("First history");
});
it.each(modes)("$name new supports localized labeled and icon-only application variants",async({New})=>{
  const el=await mount(<New/>,"zh-CN");
  const button=()=>el.host.querySelector<HTMLButtonElement>('.conversation-new-button')!;
  expect(button().textContent).toBe("新建会话");
  expect(button().getAttribute("aria-label")).toBe("新建会话");
  await el.render(<New showLabel={false}/>);
  expect(button().textContent).toBe("");
  expect(button().querySelector("svg")).not.toBeNull();
  expect(button().getAttribute("aria-label")).toBe("新建会话");
  await act(async()=>button().click());
  await until(()=>el.runtime.threads.getState().mainThreadId!=="history");
  await el.render(<New showLabel newProps={{className:"application-button"}}/>,"en-US");
  expect(button().classList.contains("application-button")).toBe(true);
  expect(button().classList.contains("conversation-new-button")).toBe(true);
  expect(button().getAttribute("aria-label")).toBe(button().textContent);
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
it.each(modes)("$name quote exposes renderers/props and follows locale with Host overrides",async({Quote})=>{
  const preview=vi.fn((props:ComponentProps<typeof Quote>["previewProps"])=><span>{props?.dismissLabel}</span>);const toolbar=vi.fn((props:ComponentProps<typeof Quote>["toolbarProps"])=><span>{props?.quoteLabel}</span>);
  const el=await mount(<Quote renderPreview={preview} renderToolbar={toolbar}/>,"zh-CN");expect(el.host.textContent).toContain("取消引用");expect(el.host.textContent).toContain("引用");
  await el.render(<Quote renderPreview={preview} renderToolbar={toolbar}/>,"en-US",{conversationQuote:{dismiss:"Host dismiss",quote:"Host quote"}});expect(el.host.textContent).toBe("Host dismissHost quote");await el.render(<Quote renderPreview={preview} renderToolbar={toolbar} previewProps={{dismissLabel:"Local dismiss"}} toolbarProps={{quoteLabel:"Local quote"}}/>);expect(el.host.textContent).toBe("Local dismissLocal quote");
});
