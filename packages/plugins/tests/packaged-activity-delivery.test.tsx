// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { AssistantRuntimeProvider, ThreadPrimitive, MessagePrimitive, useLocalRuntime } from "@assistant-ui/react";
import { AgentUILocaleProvider, DataMessageUIRegistration, defineDataMessageUI, type ConversationToolCallProps, type ConversationAgentPlanProps, type ConversationAgentStatusProps, type JobProgressProps, type ConversationFileProps } from "@za38.03/agent-ui-plugins";
import statusDefinition, { AgentStatusMessagePlugin } from "../dist/agent-status-message/index.js";
import planDefinition, { AgentPlanMessagePlugin } from "../dist/agent-plan-message/index.js";
import progressDefinition, { JobProgressMessagePlugin } from "../dist/job-progress-message/index.js";
import fileDefinition, { GeneratedFileMessagePlugin } from "../dist/generated-file-message/index.js";
import { AgentStatusMessagePlugin as SourceStatus } from "../dist/sources/takeover/agent-status-message/index";
import { AgentPlanMessagePlugin as SourcePlan } from "../dist/sources/takeover/agent-plan-message/index";
import { JobProgressMessagePlugin as SourceProgress } from "../dist/sources/takeover/job-progress-message/index";
import { GeneratedFileMessagePlugin as SourceFile } from "../dist/sources/takeover/generated-file-message/index";
import { AgentRuntimeProvider, useAgentState, useAgentRuntimeActions } from "../resources/registry/items/foundation-core-runtime/files/runtime/context";
import type { AgentRuntime } from "@za38.03/agent-ui-core";
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root|undefined;
afterEach(async()=>{await act(async()=>root?.unmount());root=undefined;document.body.replaceChildren();});
function Host({children}:{children:ReactNode}){const runtime=useLocalRuntime({async *run(){}});return <AssistantRuntimeProvider runtime={runtime}><AgentUILocaleProvider locale="zh-CN">{children}</AgentUILocaleProvider></AssistantRuntimeProvider>;}
async function mount(children:ReactNode,withHost=true){const el=document.createElement("div");document.body.append(el);root=createRoot(el);await act(async()=>root!.render(withHost?<Host>{children}</Host>:children));return el;}
const tool=(overrides:Partial<ConversationToolCallProps>={}):ConversationToolCallProps=>({toolCallId:"call",toolName:"tool",args:{},status:{type:"running"},...overrides});
const file={filename:"report.pdf",mimeType:"application/pdf",url:"https://example.test/report.pdf"};
const modes=[{name:"npm",Status:AgentStatusMessagePlugin,Plan:AgentPlanMessagePlugin,Progress:JobProgressMessagePlugin,File:GeneratedFileMessagePlugin},{name:"portable",Status:SourceStatus,Plan:SourcePlan,Progress:SourceProgress,File:SourceFile}];
it("preserves render-only tool registrations and the authoritative data-message name",()=>{
  expect(statusDefinition.toolkit?.mock_agent_status).toEqual({type:"backend",display:"standalone",render:AgentStatusMessagePlugin});
  expect(progressDefinition.toolkit?.run_ci_job).toEqual({type:"backend",display:"standalone",render:JobProgressMessagePlugin});
  expect(fileDefinition.toolkit?.generate_file).toEqual({type:"backend",display:"standalone",render:GeneratedFileMessagePlugin});
  expect(planDefinition.dataMessageUIs).toEqual([{name:"agui-activity/agent-plan",render:AgentPlanMessagePlugin}]);
  for(const definition of [statusDefinition,planDefinition,progressDefinition,fileDefinition]){expect(definition.Component).toBeDefined();for(const entry of Object.values(definition.toolkit??{}))expect(entry).not.toHaveProperty("execute");}
});
it.each(modes)("$name status exposes props/renderers while preserving lifecycle and fallback callbacks",async({Status})=>{
  const render=vi.fn((props:ConversationAgentStatusProps)=><span>{props.label}:{props.state}</span>);const fallback=vi.fn((props:ConversationToolCallProps)=><aside>{props.toolCallId}</aside>);const resume=vi.fn();
  const el=await mount(<Status {...tool({args:{label:"Agent label",elapsed:"2s"},status:{type:"requires-action"}})} statusProps={{label:"Application label"}} rootProps={{"aria-label":"status-app",style:{padding:11}}} renderStatus={render}/>);
  expect(el.textContent).toContain("Application label:waiting");expect(el.querySelector<HTMLElement>('[aria-label="status-app"]')?.style.padding).toBe("11px");expect(render.mock.calls[0]?.[0]).toMatchObject({state:"waiting",label:"Application label",elapsed:"2s"});
  await act(async()=>root!.render(<Host><Status {...tool({args:{label:"valid"},status:{type:"incomplete",reason:"cancelled"},resume})} Fallback={fallback}/></Host>));
  expect(fallback.mock.calls.at(-1)?.[0]).toMatchObject({toolCallId:"call",resume,status:{type:"incomplete",reason:"cancelled"}});
  await act(async()=>root!.render(<Host><Status {...tool({args:{label:" "}})} Fallback={fallback}/></Host>));expect(fallback).toHaveBeenCalledTimes(2);
});
it.each(modes)("$name plan exposes composition and accepts only authoritative valid activity payloads",async({Plan})=>{
  const render=vi.fn((props:ConversationAgentPlanProps)=><section>{props.title}:{props.activeIndex}</section>);
  const data={title:"Agent plan",steps:[{id:"stable",label:"first",description:"detail"}],activeIndex:1};
  const el=await mount(<Plan data={data} planProps={{title:"Application plan"}} rootProps={{"aria-label":"plan-app"}} renderPlan={render}/>);
  expect(el.querySelector('[aria-label="plan-app"]')?.textContent).toBe("Application plan:1");expect(render.mock.calls[0]?.[0]).toMatchObject({steps:data.steps,activeIndex:1});
  await act(async()=>root!.render(<Host><Plan data={{...data,activeIndex:2}} renderPlan={render}/></Host>));expect(el.textContent).toBe("");expect(render).toHaveBeenCalledOnce();
});
it.each(modes)("$name job consumes the existing Host state and abort action, preserving terminal and requires-action behavior",async({Progress})=>{
  let snapshot={state:{jobs:{call:{stageIndex:0,stageProgress:0.25,eta:"2s"}}}};const listeners=new Set<()=>void>();const abort=vi.fn();
  const runtime={getSnapshot:()=>snapshot,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>listeners.delete(fn);},abort} as unknown as AgentRuntime;
  const args={target:"CI",stages:[{name:"build",weight:1}]};let status:ConversationToolCallProps["status"]={type:"running"};let result:unknown;const fallback=vi.fn(()=><aside>fallback</aside>);
  const render=vi.fn((props:JobProgressProps)=><button onClick={props.onCancel}>{props.title}:{props.stageProgress}:{props.outcome?.status}</button>);
  function Application(){const state=useAgentState();const {abortRun}=useAgentRuntimeActions();return <Progress {...tool({args,status,result})} state={state} abortRun={abortRun} progressProps={{title:"Application CI"}} renderProgress={render} Fallback={fallback}/>;}
  const element=()=> <AgentRuntimeProvider runtime={runtime}><Application/></AgentRuntimeProvider>;
  const el=await mount(element());expect(el.textContent).toContain("Application CI:0.25");await act(async()=>el.querySelector<HTMLButtonElement>("button")!.click());expect(abort).toHaveBeenCalledOnce();
  await act(async()=>{snapshot={state:{jobs:{call:{stageIndex:0,stageProgress:0.75,eta:"1s"}}}};listeners.forEach(fn=>fn());});expect(el.textContent).toContain("0.75");
  status={type:"complete"};result={outcome:{status:"partial",summary:"backend outcome"},elapsedMs:1200};await act(async()=>root!.render(<Host>{element()}</Host>));expect(render.mock.calls.at(-1)?.[0]).toMatchObject({outcome:{status:"partial",summary:"backend outcome"},elapsedMs:1200});expect(render.mock.calls.at(-1)?.[0].onCancel).toBeUndefined();
  status={type:"requires-action",reason:"interrupt"};await act(async()=>root!.render(<Host>{element()}</Host>));expect(el.textContent).toBe("fallback");expect(fallback).toHaveBeenCalledOnce();
});
it.each(modes)("$name generated file forwards props and renderer while rejecting invalid or non-success results",async({File})=>{
  const render=vi.fn((props:ConversationFileProps)=><a href={props.data}>{props.filename}</a>);const fallback=vi.fn((props:ConversationToolCallProps)=><aside>{props.status.type}</aside>);
  const el=await mount(<File {...tool({status:{type:"complete"},result:file})} fileProps={{filename:"Application report.pdf"}} renderFile={render}/>);expect(el.querySelector("a")?.textContent).toBe("Application report.pdf");expect(el.querySelector("a")?.getAttribute("href")).toBe(file.url);
  for(const override of [{status:{type:"running"} as const},{status:{type:"complete"} as const,isError:true},{status:{type:"complete"} as const,result:{...file,url:"javascript:bad"}}]) await act(async()=>root!.render(<Host><File {...tool({result:file,...override})} Fallback={fallback}/></Host>));expect(fallback).toHaveBeenCalledTimes(3);expect(render).toHaveBeenCalledOnce();
});

it.each(modes)("$name plan routes native data messages through a customized application renderer",async({Plan})=>{
  const definition=defineDataMessageUI<unknown>({name:"agui-activity/agent-plan",render:({data})=><Plan data={data} planProps={{title:"Application-routed plan"}} renderPlan={props=><section data-routed-plan="">{props.title}:{props.steps.length}</section>}/>});
  function Routed(){const runtime=useLocalRuntime({async *run(){}},{initialMessages:[{role:"assistant",content:[{type:"data",name:"agui-activity/agent-plan",data:{title:"Agent plan",steps:[{label:"first"}],activeIndex:0}}],status:{type:"complete",reason:"stop"}}]});return <AssistantRuntimeProvider runtime={runtime}><DataMessageUIRegistration definition={definition}/><ThreadPrimitive.Messages components={{Message:()=> <MessagePrimitive.Parts/>}}/></AssistantRuntimeProvider>;}
  const el=await mount(<Routed/>,false);expect(el.querySelectorAll("[data-routed-plan]")).toHaveLength(1);expect(el.textContent).toBe("Application-routed plan:1");
});
it.each(modes)("$name default presentations retain native content, download URL and cancellation with application props",async({Status,Plan,Progress,File})=>{
  const abort=vi.fn();
  const el=await mount(<><Status {...tool({args:{label:"Agent status",elapsed:"2s"},status:{type:"complete"}})} statusProps={{label:"Application status"}}/><Plan data={{steps:[{label:"first"}],activeIndex:0}} planProps={{title:"Application plan"}}/><Progress {...tool({args:{target:"CI",stages:[{name:"build",weight:1}]}})} state={{jobs:{call:{stageIndex:0,stageProgress:0.3,eta:"2s"}}}} abortRun={abort} progressProps={{title:"Application job","aria-label":"job-app",style:{padding:13}}}/><File {...tool({status:{type:"complete"},result:file})} fileProps={{filename:"Application file.pdf"}}/></>);
  for(const text of ["Application status","Application plan","Application job","Application file.pdf"])expect(el.textContent).toContain(text);
  expect(el.querySelector<HTMLElement>('[aria-label="job-app"]')?.style.padding).toBe("13px");expect(el.querySelector('a[href="https://example.test/report.pdf"]')).not.toBeNull();
  const cancel=el.querySelector<HTMLButtonElement>('[aria-label="job-app"] button')!;await act(async()=>cancel.click());expect(abort).toHaveBeenCalledOnce();
});
