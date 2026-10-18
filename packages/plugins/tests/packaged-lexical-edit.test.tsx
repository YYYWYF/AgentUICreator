// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {useAui,type AssistantRuntime} from "@assistant-ui/react";
import {afterEach,expect,it,vi} from "vitest";
import {AgentUIRoot,AgentUILocaleProvider,ConversationThread} from "@za38.03/agent-ui-plugins";
import {ConversationRuntimeProvider} from "@za38.03/agent-ui-runtime";
import {CancellationAwareHttpAgent} from "../../runtime/src/compatibility/cancellation-aware-http-agent";
import type {RunAgentInput} from "@ag-ui/client";
import {ConversationLexicalEditComposer as NpmEdit} from "../dist/lexical-edit-composer/index.js";
import {ConversationLexicalEditComposer as SourceEdit} from "../dist/sources/takeover/lexical-edit-composer/index";
const modes=[{name:"npm",Edit:NpmEdit},{name:"portable",Edit:SourceEdit}];
const directive=":user[张三]{name=employee_84721}";
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root|undefined;
afterEach(async()=>{await act(async()=>root?.unmount());root=undefined;document.body.replaceChildren();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function until(predicate:()=>boolean){for(let i=0;i<100&&!predicate();i++)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,5));});expect(predicate()).toBe(true);}
async function mount(Edit:typeof NpmEdit,text=directive+" old question",disabled=false){
 vi.stubGlobal("ResizeObserver",class{observe(){}unobserve(){}disconnect(){}});Object.defineProperty(HTMLElement.prototype,"scrollTo",{configurable:true,value(){}});Object.defineProperty(Range.prototype,"getBoundingClientRect",{configurable:true,value:()=>new DOMRect()});Object.defineProperty(Range.prototype,"getClientRects",{configurable:true,value:()=>[]});
 const requests:RunAgentInput[]=[];let runtime!:AssistantRuntime;
 const agentFactory=()=>new CancellationAwareHttpAgent({url:"http://example.test/agent",fetch:async(_url,init)=>{const input=JSON.parse(String(init?.body)) as RunAgentInput;requests.push(input);return new Response([{type:"RUN_STARTED",threadId:input.threadId,runId:input.runId},{type:"RUN_FINISHED",threadId:input.threadId,runId:input.runId}].map(event=>`data: ${JSON.stringify(event)}\n\n`).join(""),{headers:{"Content-Type":"text/event-stream"}});}});
 const binding={getThreadId:()=>"history",subscribe:()=>()=>{},createNewThread:async()=>"new",getThreadIsDisabled:()=>disabled,loadThread:async()=>({messages:[{id:"user",role:"user" as const,content:[{type:"text",text}],createdAt:new Date(0),metadata:{custom:{quote:{text:"Original quote",messageId:"quoted"}}}}]})};
 function Capture(){runtime=useAui().threads.__internal_getAssistantRuntime!();return null;}
 const el=document.createElement("div");document.body.append(el);root=createRoot(el);
 await act(async()=>root!.render(<ConversationRuntimeProvider endpoint="http://example.test/agent" threadBinding={binding} unstable_agentFactory={agentFactory}><AgentUIRoot theme="light"><AgentUILocaleProvider locale="zh-CN"><Capture/><ConversationThread composer={null} labels={{generationStopped:"Stopped",editCancel:"Cancel edit",editUpdate:"Update edit",editInput:"Edit message"}} components={{UserEditComposer:()=> <Edit inputProps={{"aria-label":"application edit",style:{padding:13}}}/>}}/></AgentUILocaleProvider></AgentUIRoot></ConversationRuntimeProvider>));await until(()=>!!runtime&&!runtime.thread.getState().isLoading);
 const begin=async()=>{await act(async()=>{el.querySelector('[data-slot="aui_user-message-root"]')!.dispatchEvent(new MouseEvent("mouseenter"));el.querySelector<HTMLButtonElement>(".aui-user-action-edit")!.click();});await until(()=>el.querySelector('[data-slot="agent-ui-edit-composer"]')!==null);};
 const click=async(label:string)=>{const button=[...el.querySelectorAll<HTMLButtonElement>("button")].find(button=>button.textContent===label)!;expect(button).toBeTruthy();await act(async()=>button.click());};
 return {el,get runtime(){return runtime;},requests,begin,click};
}
it.each(modes)("$name rich edit forwards native input props, preserves directive/quote and sends only canonical text",async({Edit})=>{
 const f=await mount(Edit);await f.begin();await until(()=>f.el.querySelector('[data-directive-id="employee_84721"]')!==null);const editor=f.el.querySelector<HTMLElement>('[aria-label="application edit"]')!;expect(editor.closest<HTMLElement>(".aui-lexical-editor")?.style.padding).toBe("13px");expect(editor.textContent).toContain("@张三");const changed=directive+" new question";await act(async()=>f.runtime.thread.getMessageById("user").composer.setText(changed));await f.click("Update edit");await until(()=>f.requests.length===1&&!f.runtime.thread.getState().isRunning);const user=f.requests[0]!.messages.find(message=>message.role==="user")!;expect(user.content).toContain(changed);expect(user.content).toContain("Original quote");expect(JSON.stringify(f.requests[0])).not.toContain('"editorState"');
});
it.each(modes)("$name cancel keeps the message and resets the draft without transport",async({Edit})=>{
 const f=await mount(Edit);await f.begin();await act(async()=>f.runtime.thread.getMessageById("user").composer.setText("local edit"));await f.click("Cancel edit");expect(f.requests).toHaveLength(0);expect(f.runtime.thread.getMessageById("user").getState().content).toEqual([{type:"text",text:directive+" old question"}]);expect(f.runtime.thread.getMessageById("user").composer.getState().isEditing).toBe(false);
});
it.each(modes)("$name unsupported directives keep their original textarea text",async({Edit})=>{
 const text=":legacy[ABC]{name=123}";const f=await mount(Edit,text);await f.begin();const textarea=f.el.querySelector<HTMLTextAreaElement>("textarea")!;expect(textarea.value).toBe(text);expect(f.el.querySelector('[contenteditable="true"]')).toBeNull();
});
it.each(modes)("$name readonly threads keep Edit disabled and never enter editing",async({Edit})=>{
 const f=await mount(Edit,undefined,true);const button=f.el.querySelector<HTMLButtonElement>(".aui-user-action-edit");expect(!button || button.disabled).toBe(true);if(button)await act(async()=>button.click());expect(f.el.querySelector('[data-slot="agent-ui-edit-composer"]')).toBeNull();expect(f.requests).toHaveLength(0);
});
