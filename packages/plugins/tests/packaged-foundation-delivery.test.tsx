// @vitest-environment jsdom
import * as NModule2 from "../dist/auth-gate/index.js";
import * as NModule9 from "../dist/locale-provider/index.js";
import * as NModule14 from "../dist/theme-provider/index.js";
import {act,type ReactNode} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,expect,expectTypeOf,it,vi} from "vitest";
import {AgentUIRoot,AgentUILocaleProvider,ConversationThread,type AgentUILocaleCode} from "@za38.03/agent-ui-plugins";
import {AssistantRuntimeProvider,useLocalRuntime} from "@assistant-ui/react";
import D0 ,{AgentIdentityPlugin as N0} from "../dist/agent-identity/index.js";
import {AgentIdentityPlugin as P0} from "../dist/sources/takeover/agent-identity/index";
import D1 ,{AuthAccountPlugin as N1} from "../dist/auth-account/index.js";
import {AuthAccountPlugin as P1} from "../dist/sources/takeover/auth-account/index";
import D2 ,{AuthGatePlugin as N2} from "../dist/auth-gate/index.js";
import {AuthGatePlugin as P2} from "../dist/sources/takeover/auth-gate/index";
import D3 ,{ConversationCommandSourcePlugin as N3} from "../dist/conversation-command-source/index.js";
import {ConversationCommandSourcePlugin as P3} from "../dist/sources/takeover/conversation-command-source/index";
import D4 ,{ConversationDataSourcePlugin as N4} from "../dist/conversation-data-source/index.js";
import {ConversationDataSourcePlugin as P4} from "../dist/sources/takeover/conversation-data-source/index";
import D5 ,{ConversationServicePlugin as N5} from "../dist/conversation-service/index.js";
import {ConversationServicePlugin as P5} from "../dist/sources/takeover/conversation-service/index";
import D6 ,{ConversationSurfacePlugin as N6} from "../dist/conversation-surface/index.js";
import {ConversationSurfacePlugin as P6} from "../dist/sources/takeover/conversation-surface/index";
import D7 ,{ConversationLexicalComposerInput as N7} from "../dist/lexical-composer-input/index.js";
import {ConversationLexicalComposerInput as P7} from "../dist/sources/takeover/lexical-composer-input/index";
import D8 ,{ConversationLexicalEditComposer as N8} from "../dist/lexical-edit-composer/index.js";
import {ConversationLexicalEditComposer as P8} from "../dist/sources/takeover/lexical-edit-composer/index";
import D9 ,{LocaleProviderPlugin as N9} from "../dist/locale-provider/index.js";
import {LocaleProviderPlugin as P9} from "../dist/sources/takeover/locale-provider/index";
import D10 ,{ConversationMentionTrigger as N10} from "../dist/mention-trigger/index.js";
import {ConversationMentionTrigger as P10} from "../dist/sources/takeover/mention-trigger/index";
import D12 ,{ConversationSlashCommandTrigger as N12} from "../dist/slash-command-trigger/index.js";
import {ConversationSlashCommandTrigger as P12} from "../dist/sources/takeover/slash-command-trigger/index";
import D13 ,{TaskGroupPlugin as N13} from "../dist/task-group/index.js";
import {TaskGroupPlugin as P13} from "../dist/sources/takeover/task-group/index";
import D14 ,{ThemeProviderPlugin as N14} from "../dist/theme-provider/index.js";
import {ThemeProviderPlugin as P14} from "../dist/sources/takeover/theme-provider/index";
import D15 ,{ThemeSwitchPlugin as N15} from "../dist/theme-switch/index.js";
import {ThemeSwitchPlugin as P15} from "../dist/sources/takeover/theme-switch/index";
const sourceDefinitions=import.meta.glob(["../dist/sources/takeover/agent-identity/definition.ts","../dist/sources/takeover/auth-account/definition.ts","../dist/sources/takeover/auth-gate/definition.ts","../dist/sources/takeover/conversation-command-source/definition.ts","../dist/sources/takeover/conversation-data-source/definition.ts","../dist/sources/takeover/conversation-service/definition.ts","../dist/sources/takeover/conversation-surface/definition.ts","../dist/sources/takeover/lexical-composer-input/definition.ts","../dist/sources/takeover/lexical-edit-composer/definition.ts","../dist/sources/takeover/locale-provider/definition.ts","../dist/sources/takeover/mention-trigger/definition.ts","../dist/sources/takeover/slash-command-trigger/definition.ts","../dist/sources/takeover/task-group/definition.ts","../dist/sources/takeover/theme-provider/definition.ts","../dist/sources/takeover/theme-switch/definition.ts"],{eager:true});
const S0=(sourceDefinitions["../dist/sources/takeover/agent-identity/definition.ts"] as typeof import("../dist/agent-identity/index.js")).default;
const S1=(sourceDefinitions["../dist/sources/takeover/auth-account/definition.ts"] as typeof import("../dist/auth-account/index.js")).default;
const S2=(sourceDefinitions["../dist/sources/takeover/auth-gate/definition.ts"] as typeof import("../dist/auth-gate/index.js")).default;
const S3=(sourceDefinitions["../dist/sources/takeover/conversation-command-source/definition.ts"] as typeof import("../dist/conversation-command-source/index.js")).default;
const S4=(sourceDefinitions["../dist/sources/takeover/conversation-data-source/definition.ts"] as typeof import("../dist/conversation-data-source/index.js")).default;
const S5=(sourceDefinitions["../dist/sources/takeover/conversation-service/definition.ts"] as typeof import("../dist/conversation-service/index.js")).default;
const S6=(sourceDefinitions["../dist/sources/takeover/conversation-surface/definition.ts"] as typeof import("../dist/conversation-surface/index.js")).default;
const S7=(sourceDefinitions["../dist/sources/takeover/lexical-composer-input/definition.ts"] as typeof import("../dist/lexical-composer-input/index.js")).default;
const S8=(sourceDefinitions["../dist/sources/takeover/lexical-edit-composer/definition.ts"] as typeof import("../dist/lexical-edit-composer/index.js")).default;
const S9=(sourceDefinitions["../dist/sources/takeover/locale-provider/definition.ts"] as typeof import("../dist/locale-provider/index.js")).default;
const S10=(sourceDefinitions["../dist/sources/takeover/mention-trigger/definition.ts"] as typeof import("../dist/mention-trigger/index.js")).default;
const S12=(sourceDefinitions["../dist/sources/takeover/slash-command-trigger/definition.ts"] as typeof import("../dist/slash-command-trigger/index.js")).default;
const S13=(sourceDefinitions["../dist/sources/takeover/task-group/definition.ts"] as typeof import("../dist/task-group/index.js")).default;
const S14=(sourceDefinitions["../dist/sources/takeover/theme-provider/definition.ts"] as typeof import("../dist/theme-provider/index.js")).default;
const S15=(sourceDefinitions["../dist/sources/takeover/theme-switch/definition.ts"] as typeof import("../dist/theme-switch/index.js")).default;
const SModule2=sourceDefinitions["../dist/sources/takeover/auth-gate/definition.ts"] as typeof import("../dist/auth-gate/index.js");
const SModule9=sourceDefinitions["../dist/sources/takeover/locale-provider/definition.ts"] as typeof import("../dist/locale-provider/index.js");
const SModule14=sourceDefinitions["../dist/sources/takeover/theme-provider/definition.ts"] as typeof import("../dist/theme-provider/index.js");
const modes=[{name:"npm",Identity:N0,Account:N1,Gate:N2,Surface:N6,Theme:N15,Tasks:N13,themeDefinition:NModule14,localeDefinition:NModule9,authDefinition:NModule2},{name:"portable",Identity:P0,Account:P1,Gate:P2,Surface:P6,Theme:P15,Tasks:P13,themeDefinition:SModule14,localeDefinition:SModule9,authDefinition:SModule2}];
const providers=[{id:"auth-gate",npm:D2,source:S2},{id:"conversation-command-source",npm:D3,source:S3},{id:"conversation-data-source",npm:D4,source:S4},{id:"conversation-service",npm:D5,source:S5},{id:"locale-provider",npm:D9,source:S9},{id:"theme-provider",npm:D14,source:S14}];
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root|undefined;
afterEach(async()=>{await act(async()=>root?.unmount());root=undefined;document.body.replaceChildren();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function mount(children:ReactNode,locale:AgentUILocaleCode="en-US"){
 vi.stubGlobal("ResizeObserver",class{observe(){}unobserve(){}disconnect(){}});Object.defineProperty(HTMLElement.prototype,"scrollTo",{configurable:true,value(){}});
 const el=document.createElement("div");document.body.append(el);root=createRoot(el);
 await act(async()=>root!.render(<AgentUIRoot theme="light"><AgentUILocaleProvider locale={locale}>{children}</AgentUILocaleProvider></AgentUIRoot>));return el;
}
async function change(input:HTMLInputElement|HTMLSelectElement,value:string){await act(async()=>{const proto=input.tagName==="SELECT"?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,"value")!.set!.call(input,value);input.dispatchEvent(new Event(input.tagName==="SELECT"?"change":"input",{bubbles:true}));});}
it.each(providers)("$id preserves Host setup context, cleanup and unbound admission in npm and extracted code",({npm,source})=>{
 const context={services:{marker:"shared Host"},actions:{marker:"same Runtime"}};
 for(const definition of [npm,source]){expect(()=>definition.setup!()).toThrow("PLUGIN_HOST_BINDINGS_REQUIRED");const cleanup=vi.fn();const setup=vi.fn((value:typeof context)=>{expect(value).toBe(context);return cleanup;});const bound=definition.bindSetup(setup);expect(bound(context)).toBe(cleanup);expect(setup).toHaveBeenCalledOnce();cleanup();expect(cleanup).toHaveBeenCalledOnce();const failed=definition.bindSetup(()=>{throw new Error("setup failure");});expect(()=>failed(context)).toThrow("setup failure");}
 expect(source.provides).toEqual(npm.provides);expect(source.inject).toEqual(npm.inject);expect(source.optionalInject).toEqual(npm.optionalInject);
});
it.each(modes)("$name identity uses unified locale/config and forwards DOM/image/text props",async({Identity})=>{
 const el=await mount(<Identity config={{name:{"en-US":"Business agent","zh-CN":"业务助手"},logo:"/brand.svg",description:"Custom description"}} rootProps={{"aria-label":"app identity",style:{padding:21}}} logoProps={{width:30}} nameProps={{title:"custom title"}}/>,"zh-CN");expect(el.textContent).toContain("业务助手");expect(el.textContent).toContain("Custom description");expect(el.querySelector<HTMLElement>('[aria-label="app identity"]')?.style.padding).toBe("21px");expect(el.querySelector("img")?.getAttribute("width")).toBe("30");expect(el.querySelector('[title="custom title"]')).not.toBeNull();
});
it.each(modes)("$name account respects Host identity and canonical session sign-out",async({Account})=>{
 const signOut=vi.fn(async()=>{});const snapshot={user:{userId:"42",userName:"Session user"},busy:false};const el=await mount(<Account snapshot={snapshot} session={{signOut}} rootProps={{"aria-label":"account root"}}/>);
 await act(async()=>el.querySelector<HTMLButtonElement>('button[aria-label="Account menu"]')!.click());const button=[...el.querySelectorAll<HTMLButtonElement>("button")].find(node=>node.textContent?.includes("Sign out"))!;await act(async()=>button.click());expect(signOut).toHaveBeenCalledOnce();
 await act(async()=>root!.render(<AgentUIRoot theme="light"><AgentUILocaleProvider><Account hostUser={{userId:"host",userName:"Host user"}} snapshot={snapshot} session={{signOut}}/></AgentUILocaleProvider></AgentUIRoot>));expect(el.textContent).toContain("Host user");expect(el.querySelector('button[aria-label="Account menu"]')).toBeNull();
});
it.each(modes)("$name auth form forwards props and signs in without persisting password",async({Gate})=>{
 const signIn=vi.fn(async()=>{});const state={status:"anonymous" as const,user:null,busy:false,error:null};const el=await mount(<Gate state={state} session={{signIn}} formProps={{"aria-label":"app login"}} accountProps={{"aria-label":"account"}} passwordProps={{"aria-label":"password"}} submitProps={{"aria-label":"submit"}}/>);
 await change(el.querySelector<HTMLInputElement>('[aria-label="account"]')!,"user");await change(el.querySelector<HTMLInputElement>('[aria-label="password"]')!,"secret");await act(async()=>el.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));expect(signIn).toHaveBeenCalledWith({account:"user",password:"secret"});expect(el.querySelector<HTMLInputElement>('[aria-label="password"]')!.value).toBe("");
});
it.each(modes)("$name theme forwards native select props and honors cancellation",async({Theme,themeDefinition})=>{
 const service=themeDefinition.createAgentUIThemeService("dark");const changed=vi.fn();service.subscribe(changed);const onChange=vi.fn((event:React.ChangeEvent<HTMLSelectElement>)=>{if(event.currentTarget.value==="violet")event.preventDefault();});const el=await mount(<Theme service={service} contextId="existing-instance" selectProps={{"aria-label":"app theme",onChange}}/>,"zh-CN");const select=el.querySelector<HTMLSelectElement>('[aria-label="app theme"]')!;expect(select.id).toBe("existing-instance-control");await change(select,"light");expect(service.getTheme()).toBe("light");expect(changed).toHaveBeenCalledOnce();await change(select,"violet");expect(service.getTheme()).toBe("light");expect(onChange).toHaveBeenCalledTimes(2);
});
it.each(modes)("$name surface preserves every semantic Slot and Host scoped renderer binding",async({Surface})=>{
 const renderSlot=vi.fn((name:string)=><span>{name}</span>);const scoped=vi.fn((_name:string,_scope:unknown,fallback:ReactNode)=>fallback);const scopes=["transientMessages","userEditComposer","reasoningGroup","thinkingIndicator","toolTimeline","toolGroup","toolFallback","taskGroup","assistantResponseFooter"];
 const Adapter=(props:import("../src/public").ConversationSurfacePluginProps["adapterProps"])=> <>{props?.welcome}{props?.suggestions}{props?.composer}{scopes.map(name=><section key={name}>{props?.renderScopedSlot?.(name,{kind:"kept",value:{id:"42"}},<span>{name}</span>)}</section>)}</>;
 const el=await mount(<Surface Adapter={Adapter} renderSlot={renderSlot} renderScopedSlot={scoped} rootProps={{"aria-label":"app surface",style:{padding:23}}} snapshot={{mode:"history",detailStatus:"ready"}}/>);expect(renderSlot.mock.calls.map(call=>call[0])).toEqual(["emptyWelcome","emptySuggestions","headerActions","composer"]);expect(scoped.mock.calls.map(call=>call[0])).toEqual(scopes);expect(el.querySelector<HTMLElement>('[aria-label="app surface"]')?.style.padding).toBe("23px");expect(el.querySelector('[data-conversation-mode="history"]')).not.toBeNull();
});
it.each(modes)("$name task group exposes renderer composition and forwards the same scope object",async({Tasks})=>{
 const group={id:"shared group"};const renderGroup=vi.fn((props:{group:unknown;className?:string})=><span>{props.className}</span>);const el=await mount(<Tasks group={group} className="app tasks" renderGroup={renderGroup}/>);expect(renderGroup.mock.calls[0]?.[0].group).toBe(group);expect(el.textContent).toBe("app tasks");
});
it.each(modes)("$name locale service keeps stable snapshots and unsubscribes",({localeDefinition})=>{
 const service=localeDefinition.createAgentUILocaleService("zh-CN");const first=service.getSnapshot();const changed=vi.fn();const off=service.subscribe(changed);service.setLocale("zh-CN");expect(service.getSnapshot()).toBe(first);expect(changed).not.toHaveBeenCalled();service.setLocale("en-US");expect(service.getSnapshot()).toEqual({locale:"en-US",direction:"ltr"});expect(changed).toHaveBeenCalledOnce();off();service.setLocale("zh-CN");expect(changed).toHaveBeenCalledOnce();
});
it.each(modes)("$name auth session owns a single gate, rejects stale restores and cleans up",async({authDefinition})=>{
 let resolve!:(user:{userId:string;userName:string})=>void;const off=vi.fn();const session=authDefinition.createAuthSession({restore:()=>new Promise(done=>{resolve=done;}),signIn:async()=>({userId:"new",userName:"New user"}),signOut:async()=>{},subscribe:()=>off});const restore=session.restore();await session.signIn({account:"user",password:"secret"});expect(session.gate.getSnapshot().status).toBe("ready");resolve({userId:"old",userName:"Stale user"});await restore;expect(session.getSnapshot().user?.userId).toBe("new");await session.signOut();expect(session.gate.getSnapshot().status).toBe("blocked");session.dispose();expect(off).toHaveBeenCalledOnce();
});
it("keeps the complete upstream optional editor input contract assignable in both directions",()=>{
 expectTypeOf<import("@assistant-ui/react-lexical").LexicalComposerInputProps>().toExtend<import("../src/lexical").ConversationLexicalInputProps>();
 expectTypeOf<import("../src/lexical").ConversationLexicalInputProps>().toExtend<import("@assistant-ui/react-lexical").LexicalComposerInputProps>();
});
