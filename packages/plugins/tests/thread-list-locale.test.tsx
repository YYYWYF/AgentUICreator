// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AssistantRuntimeProvider, useLocalRuntime, useRemoteThreadListRuntime, type RemoteThreadListAdapter } from "@assistant-ui/react";
import { afterEach, expect, it, vi } from "vitest";
import { AgentUILocaleProvider, type AgentUILocaleCode } from "../src/locale";
import { useConversationThreadListGroups } from "../src/public";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const now = new Date(); const yesterday = new Date(now.getFullYear(),now.getMonth(),now.getDate()-1,12); const earlier = new Date(now.getFullYear(),now.getMonth(),now.getDate()-3,12);
const rows = [{remoteId:"unnamed",status:"regular" as const,lastMessageAt:now},{remoteId:"yesterday",status:"regular" as const,title:"Custom $&",lastMessageAt:yesterday},{remoteId:"earlier",status:"regular" as const,title:"Older",lastMessageAt:earlier}];
const unused = async () => { throw new Error("Unexpected adapter action"); };
const adapter: RemoteThreadListAdapter = {list:async()=>({threads:rows}),fetch:async id=>rows.find(row=>row.remoteId===id)!,initialize:unused,rename:unused,archive:unused,unarchive:unused,delete:unused,generateTitle:unused};
const mounts = vi.fn();
function Group({id,label}:{id:string;label:string}) { useEffect(()=>{mounts(id);},[id]); return <section data-group={id}><span>{label}</span><input defaultValue="draft" /></section>; }
function Probe({query}:{query:string}) { const state=useConversationThreadListGroups(query);return <><output>{JSON.stringify({ids:state.filteredIndices.map(i=>state.threadIds[i])})}</output>{state.groups?.map(group=><Group key={group.id} id={group.id} label={group.label}/>)}</>; }
function runtimeHook(){return useLocalRuntime({async *run(){}});}
function Host({locale,query=""}:{locale:AgentUILocaleCode;query?:string}) { const runtime=useRemoteThreadListRuntime({runtimeHook,adapter});return <AssistantRuntimeProvider runtime={runtime}><AgentUILocaleProvider locale={locale}><Probe query={query}/></AgentUILocaleProvider></AssistantRuntimeProvider>; }
let root: Root | undefined;
afterEach(async()=>{await act(async()=>root?.unmount());root=undefined;document.body.replaceChildren();mounts.mockClear();});
async function mount(){const el=document.createElement("div");document.body.append(el);root=createRoot(el);await act(async()=>root!.render(<Host locale="zh-CN"/>));for(let i=0;i<30&&!el.querySelector('[data-group="Earlier"]');i++){await act(async()=>{await new Promise(resolve=>setTimeout(resolve,10));});}return el;}
it("translates date headings without remounting groups or losing their local state",async()=>{const el=await mount();expect(el.textContent).toContain("今天");expect(el.textContent).toContain("昨天");expect(el.textContent).toContain("更早");const input=el.querySelector<HTMLInputElement>('[data-group="Today"] input')!;input.value="keep $& draft";const count=mounts.mock.calls.length;await act(async()=>root!.render(<Host locale="en-US"/>));expect(el.textContent).toContain("Yesterday");expect(el.querySelector('[data-group="Today"] input')).toBe(input);expect(input.value).toBe("keep $& draft");expect(mounts).toHaveBeenCalledTimes(count);});
it("searches unnamed threads by the displayed localized title",async()=>{const el=await mount();await act(async()=>root!.render(<Host locale="zh-CN" query="新会话"/>));expect(JSON.parse(el.querySelector("output")!.textContent!).ids).toEqual(["unnamed"]);await act(async()=>root!.render(<Host locale="en-US" query="New Chat"/>));expect(JSON.parse(el.querySelector("output")!.textContent!).ids).toEqual(["unnamed"]);});
it("does not translate or replace custom titles when searching",async()=>{const el=await mount();await act(async()=>root!.render(<Host locale="zh-CN" query="Custom $&"/>));expect(JSON.parse(el.querySelector("output")!.textContent!).ids).toEqual(["yesterday"]);await act(async()=>root!.render(<Host locale="en-US" query="Custom $&"/>));expect(JSON.parse(el.querySelector("output")!.textContent!).ids).toEqual(["yesterday"]);});
