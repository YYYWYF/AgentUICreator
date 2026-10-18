// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AssistantRuntimeProvider, MessagePrimitive, ThreadPrimitive, useLocalRuntime } from "@assistant-ui/react";
import { afterEach, expect, it, vi } from "vitest";
import { AgentUILocaleProvider, DataMessageUIRegistration, defineDataMessageUI, type ConversationToolCallProps, type ConversationSourcePart, type AgentUILocaleCode, type AgentUILocaleOverrides, type RetrievalChunksProps, type WebSearchProps } from "@za38.03/agent-ui-plugins";
import chartDefinition, { ChartMessagePlugin } from "../dist/chart-message/index.js";
import sourceDefinition, { SourceCitationsMessagePlugin } from "../dist/source-citations-message/index.js";
import retrievalDefinition, { RetrievalChunksPlugin } from "../dist/retrieval-chunks/index.js";
import webDefinition, { WebSearchPlugin } from "../dist/web-search/index.js";
import { ChartMessagePlugin as SourceChart } from "../dist/sources/takeover/chart-message/index";
import { SourceCitationsMessagePlugin as SourceCitations } from "../dist/sources/takeover/source-citations-message/index";
import { RetrievalChunksPlugin as SourceRetrieval } from "../dist/sources/takeover/retrieval-chunks/index";
import { WebSearchPlugin as SourceWeb } from "../dist/sources/takeover/web-search/index";
const modes=[{name:"npm",Chart:ChartMessagePlugin,Citations:SourceCitationsMessagePlugin,Retrieval:RetrievalChunksPlugin,Web:WebSearchPlugin},{name:"portable",Chart:SourceChart,Citations:SourceCitations,Retrieval:SourceRetrieval,Web:SourceWeb}];
const tool=(overrides:Partial<ConversationToolCallProps>={}):ConversationToolCallProps=>({toolCallId:"kept-id",toolName:"tool",args:{query:"Agent query"},status:{type:"complete"},...overrides});
const chunks=[{id:"one",source:"Alpha",locator:"p1",text:"first passage",score:0.9},{id:"two",source:"Beta",locator:"p2",text:"second passage",score:0.5}];
const results=[{title:"First web page",domain:"one.test"},{title:"Second web page",domain:"two.test"}];
const sources=[{sourceType:"url" as const,id:"url-id",title:"Source page",url:"https://example.test/page"},{sourceType:"document" as const,id:"doc-id",title:"Source document",mediaType:"application/pdf",filename:"report.pdf"}];
const chart={title:"Agent chart",items:[{label:"negative",value:-2},{label:"half",value:5},{label:"full",value:10}]};
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root|undefined;
afterEach(async()=>{await act(async()=>root?.unmount());root=undefined;document.body.replaceChildren();});
function Host({children,locale="zh-CN",messages}:{children:ReactNode;locale?:AgentUILocaleCode;messages?:AgentUILocaleOverrides | undefined}){const runtime=useLocalRuntime({async *run(){}});return <AssistantRuntimeProvider runtime={runtime}><AgentUILocaleProvider locale={locale} {...(messages ? {messages} : {})}>{children}</AgentUILocaleProvider></AssistantRuntimeProvider>;}
async function mount(children:ReactNode,withHost=true){const el=document.createElement("div");document.body.append(el);root=createRoot(el);await act(async()=>root!.render(withHost?<Host>{children}</Host>:children));return el;}
it("preserves the chart data route and render-only tool registrations",()=>{
  expect(chartDefinition.dataMessageUIs).toEqual([{name:"chart",render:ChartMessagePlugin}]);
  for(const [definition,name,render] of [[sourceDefinition,"search_sources",SourceCitationsMessagePlugin],[retrievalDefinition,"search_docs",RetrievalChunksPlugin],[webDefinition,"web_search",WebSearchPlugin]] as const){expect(definition.toolkit?.[name]).toEqual({type:"backend",display:"standalone",render});expect(definition.toolkit?.[name]).not.toHaveProperty("execute");}
});
it.each(modes)("$name chart routes native data messages through application props and keeps bar/value behavior",async({Chart})=>{
  const definition=defineDataMessageUI<unknown>({name:"chart",render:({data})=><Chart data={data} rootProps={{"aria-label":"application-chart",style:{padding:17}}} barProps={{style:{opacity:0.5}}} formatValue={value=>`value=${value}`}/>});
  function Routed(){const runtime=useLocalRuntime({async *run(){}},{initialMessages:[{role:"assistant",content:[{type:"data",name:"chart",data:chart}],status:{type:"complete",reason:"stop"}}]});return <AssistantRuntimeProvider runtime={runtime}><DataMessageUIRegistration definition={definition}/><ThreadPrimitive.Messages components={{Message:()=> <MessagePrimitive.Parts/>}}/></AssistantRuntimeProvider>;}
  const el=await mount(<Routed/>,false);expect(el.querySelectorAll('[data-slot="chart-message"]')).toHaveLength(1);expect(el.querySelector<HTMLElement>('[aria-label="application-chart"]')?.style.padding).toBe("17px");expect(el.textContent).toContain("value=-2");
  expect([...el.querySelectorAll<HTMLElement>('[data-slot="chart-message-fill"]')].map(element=>element.style.width)).toEqual(["0%","50%","100%"]);expect(el.querySelector<HTMLElement>('[data-slot="chart-message-fill"]')?.style.opacity).toBe("0.5");
});
it.each(modes)("$name chart supports item/full composition and safely omits invalid external data",async({Chart})=>{
  const item=vi.fn((value:{label:string})=><strong>{value.label}</strong>);const whole=vi.fn((value:{title:string})=><aside>{value.title}</aside>);
  const el=await mount(<Chart data={chart} captionProps={{style:{fontWeight:700}}} renderItem={item}/>);expect(el.querySelectorAll("li strong")).toHaveLength(3);expect(el.querySelector("figcaption")?.style.fontWeight).toBe("700");
  await act(async()=>root!.render(<Host><Chart data={chart} renderChart={whole}/></Host>));expect(el.querySelector("aside")?.textContent).toBe(chart.title);
  for(const data of [null,{}, {...chart,items:"invalid"},{...chart,items:[{label:"bad",value:NaN}]}])await act(async()=>root!.render(<Host><Chart data={data} renderChart={whole}/></Host>));expect(el.textContent).toBe("");expect(whole).toHaveBeenCalledOnce();
});
it.each(modes)("$name source citations preserve URL/document rendering, props factories and validated fallback",async({Citations})=>{
  const fallback=vi.fn((props:ConversationToolCallProps)=><aside>{props.toolCallId}</aside>);const resume=vi.fn();
  const el=await mount(<Citations {...tool({result:{sources}})} rootProps={{"aria-label":"source-app",style:{padding:19}}} sourceProps={(source,index)=>({...source,title:`Application ${index}`})}/>);
  expect(el.querySelector<HTMLElement>('[aria-label="source-app"]')?.style.padding).toBe("19px");expect(el.querySelector('a[href="https://example.test/page"]')?.textContent).toContain("Application 0");expect(el.textContent).toContain("Application 1");
  const render=vi.fn((source:ConversationSourcePart)=><i>{source.id}</i>);
  await act(async()=>root!.render(<Host><Citations {...tool({result:{sources}})} renderSource={render}/></Host>));expect(el.querySelectorAll("i")).toHaveLength(2);
  const all=vi.fn((items:readonly ConversationSourcePart[])=><section>{items.map(item=>item.id).join(",")}</section>);await act(async()=>root!.render(<Host><Citations {...tool({result:{sources}})} renderSources={all}/></Host>));expect(el.textContent).toBe("url-id,doc-id");expect(all).toHaveBeenCalledOnce();
  for(const override of [{status:{type:"requires-action",reason:"interrupt"} as const},{result:{sources:[{...sources[0],url:"javascript:bad"}]}},{result:{sources:[sources[0],sources[0]]}}])await act(async()=>root!.render(<Host><Citations {...tool({result:{sources},resume,...override})} Fallback={fallback}/></Host>));expect(fallback).toHaveBeenCalledTimes(3);expect(fallback.mock.calls[0]?.[0]).toMatchObject({toolCallId:"kept-id",resume,status:{type:"requires-action",reason:"interrupt"}});
});
it.each(modes)("$name retrieval forwards native DOM/count props and merges partial locale labels",async({Retrieval})=>{
  const clicked=vi.fn();const el=await mount(<Retrieval {...tool({result:{chunks}})} retrievalProps={{visibleCount:1,"aria-label":"retrieval-app",style:{padding:21},onClick:clicked,labels:{complete:"Application {count}"}}}/>);
  expect(el.textContent).toContain("Application 2");expect(el.textContent).toContain("first passage");expect(el.textContent).not.toContain("second passage");expect(el.querySelectorAll('[role="meter"]')).toHaveLength(1);expect(el.querySelector('[role="meter"]')?.getAttribute("aria-label")).toBe("Alpha 相关度");expect(el.querySelector('[role="meter"]')?.getAttribute("aria-valuetext")).toBe("0.90，满分 1.00");
  const element=el.querySelector<HTMLElement>('[aria-label="retrieval-app"]')!;expect(element.style.padding).toBe("21px");await act(async()=>element.click());expect(clicked).toHaveBeenCalledOnce();
  const render=vi.fn((props:RetrievalChunksProps)=><aside>{props.query}:{props.chunks.length}</aside>);await act(async()=>root!.render(<Host><Retrieval {...tool({result:{chunks}})} retrievalProps={{query:"Application query"}} renderRetrieval={render}/></Host>));expect(el.textContent).toBe("Application query:2");expect(render.mock.calls[0]?.[0].labels.retrieving).toBe("正在检索");
});
it.each(modes)("$name web search forwards native DOM/count/cycle props and exposes its renderer",async({Web})=>{
  let cycle=3;const content=()=> <Host><Web {...tool({result:{results}})} searchProps={{visibleResults:1,cycle,"aria-label":"web-app",style:{padding:23},labels:{complete:"Application {count}"}}}/></Host>;
  const el=await mount(content(),false);expect(el.textContent).toContain("Application 2");expect(el.textContent).toContain("First web page");expect(el.textContent).not.toContain("Second web page");expect(el.querySelector<HTMLElement>('[aria-label="web-app"]')?.style.padding).toBe("23px");const first=[...el.querySelectorAll("span")].find(span=>span.textContent==="First web page");
  cycle=4;await act(async()=>root!.render(content()));expect([...el.querySelectorAll("span")].find(span=>span.textContent==="First web page")).not.toBe(first);
  const render=vi.fn((props:WebSearchProps)=><aside>{props.query}:{props.results.length}</aside>);await act(async()=>root!.render(<Host><Web {...tool({result:{results}})} searchProps={{query:"Application query"}} renderSearch={render}/></Host>));expect(el.textContent).toBe("Application query:2");expect(render.mock.calls[0]?.[0].labels.searching).toBe("正在搜索");
});
it.each(modes)("$name search keeps streaming partials, requires-action/errors and callback identity",async({Retrieval,Web})=>{
  const fallback=vi.fn((props:ConversationToolCallProps)=><aside>{props.toolCallId}</aside>);const respondToApproval=vi.fn();
  const el=await mount(<><Retrieval {...tool({status:{type:"running"},result:{chunks:[{}]}})} Fallback={fallback}/><Web {...tool({status:{type:"running"},result:{results:[{}]}})} Fallback={fallback}/></>);expect(fallback).not.toHaveBeenCalled();expect(el.textContent).toContain("正在检索");expect(el.textContent).toContain("正在搜索");
  for(const status of [{type:"complete"},{type:"requires-action",reason:"interrupt"},{type:"incomplete",reason:"error"}] as const)await act(async()=>root!.render(<Host><Retrieval {...tool({status,result:{chunks:[{}]},respondToApproval})} Fallback={fallback}/><Web {...tool({status,result:{results:[{}]},respondToApproval})} Fallback={fallback}/></Host>));expect(fallback).toHaveBeenCalledTimes(6);for(const [props] of fallback.mock.calls)expect(props).toMatchObject({toolCallId:"kept-id",respondToApproval});
});
it.each(modes)("$name search uses the unified locale and preserves existing searchTools overrides",async({Retrieval,Web})=>{
  const content=(locale:AgentUILocaleCode,messages?:AgentUILocaleOverrides)=> <Host locale={locale} {...(messages ? {messages} : {})}><Retrieval {...tool({result:{chunks}})}/><Web {...tool({result:{results}})}/></Host>;
  const el=await mount(content("zh-CN"),false);expect(el.textContent).toContain("已检索 2 个片段");expect(el.textContent).toContain("已读取 2 个来源");await act(async()=>root!.render(content("en-US")));expect(el.textContent).toContain("2 passages retrieved");expect(el.textContent).toContain("Read 2 sources");await act(async()=>root!.render(content("en-US",{searchTools:{sources:"Host {count}",passages:"Local {count}"}})));expect(el.textContent).toContain("Host 2");expect(el.textContent).toContain("Local 2");
});
