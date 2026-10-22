// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { MockServicePanel } from "../src/ui/MockServicePanel.js";
import { CreatorLocaleProvider } from "../src/ui/i18n/locale.js";
import { publishCreatorRefresh } from "../src/ui/creatorRefresh.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root=undefined; document.body.replaceChildren(); vi.unstubAllGlobals(); });
const scenarios = ["custom-chart", "a2ui-form-controls", "subagent-task"].map(id=>({id,title:id,resources:[`resource-${id}`]}));
const state = {status:"stopped",endpoint:null,scenarioId:"plain",selection:{type:"builtin",id:"plain"},projectId:"project",recordings:[],speed:1,scenarios:[...scenarios,{id:"plain",title:"Plain"}]};
const unknown = {projectId:"project",status:"unknown",requirements:[]};
const json = (value:unknown) => new Response(JSON.stringify(value),{headers:{"content-type":"application/json"}});
async function mount() {
  const container=document.createElement("div"); document.body.append(container); root=createRoot(container);
  await act(async()=>root!.render(<CreatorLocaleProvider><MockServicePanel projectId="project" /></CreatorLocaleProvider>));
  return container;
}
it("does not mistake unavailable inspection for missing resources",async()=>{
  vi.stubGlobal("fetch",vi.fn(async(url:string)=>json(url.endsWith("/compatibility")?unknown:state)));
  const container=await mount();
  const buttons=Array.from(container.querySelectorAll("button")).filter(button=>button.getAttribute("aria-label")==="下载资源");
  expect(buttons).toHaveLength(0);
  expect(container.textContent).not.toContain("无法检查当前项目的资源");
  await act(async()=>publishCreatorRefresh({projectId:"project",compatibility:{projectId:"project",status:"checked",requirements:scenarios.map(scenario=>({id:scenario.resources[0]!,name:scenario.title,scenarioIds:[scenario.id],status:"missing",installable:true}))}}));
  expect(container.querySelectorAll('.creator-mock-install-icon')).toHaveLength(3);
});
it("does not offer downloads for resources already available in the project",async()=>{
  const checked={projectId:"project",status:"checked",requirements:scenarios.map(scenario=>({id:scenario.resources[0]!,name:scenario.title,scenarioIds:[scenario.id],status:"ready",installable:true}))};
  vi.stubGlobal("fetch",vi.fn(async(url:string)=>json(url.endsWith("/compatibility")?checked:state)));
  const container=await mount();
  expect(container.querySelectorAll('.creator-mock-install-icon')).toHaveLength(0);
});

it("shows a busy icon throughout installation and prevents repeat downloads",async()=>{
  const checked={projectId:"project",status:"checked",requirements:[{id:"resource-custom-chart",name:"Chart",scenarioIds:["custom-chart"],status:"missing",installable:true}]};
  let finish!: (response:Response)=>void;
  vi.stubGlobal("fetch",vi.fn((url:string)=>url.endsWith("/install-resources")
    ? new Promise<Response>(resolve=>{finish=resolve;})
    : Promise.resolve(json(url.endsWith("/compatibility")?checked:state))));
  const container=await mount();
  const button=container.querySelector('.creator-mock-install-icon') as HTMLButtonElement;
  await act(async()=>button.click());
  expect(button.disabled).toBe(true);
  expect(button.getAttribute("aria-busy")).toBe("true");
  expect(button.querySelector('.creator-mock-install-spinner')).not.toBeNull();
  await act(async()=>finish(json({...checked,requirements:[{...checked.requirements[0],status:"ready"}]})));
  expect(container.querySelector('.creator-mock-install-spinner')).toBeNull();
  expect(container.querySelector('[data-status="success"]')).not.toBeNull();
});

it.each(["unknown", "checked"])("selects through the cached service when panel readiness is %s",async status=>{
  let finish!: (response:Response)=>void;
  let inspections=0;
  const fetch=vi.fn((url:string)=>{
    if(url.endsWith('/compatibility')) { inspections++; return Promise.resolve(json(status==='unknown'?unknown:{projectId:'project',status:'checked',requirements:[]})); }
    if(url.endsWith('/select')) return new Promise<Response>(resolve=>{finish=resolve;});
    return Promise.resolve(json(state));
  });
  vi.stubGlobal('fetch',fetch);
  const container=await mount();
  const card=Array.from(container.querySelectorAll('.creator-mock-scenario')).find(node=>node.querySelector('strong')?.textContent==='custom-chart')!;
  const radio=card.querySelector('input') as HTMLInputElement;
  await act(async()=>radio.click());
  expect(finish).toBeDefined();
  expect(radio.checked).toBe(false);
  expect(radio.disabled).toBe(true);
  await act(async()=>finish(json({...state,scenarioId:'custom-chart',selection:{type:'builtin',id:'custom-chart'}})));
  expect(radio.checked).toBe(true);
  expect(inspections).toBe(1);
  await act(async()=>radio.click());
  await act(async()=>finish(json({...state,scenarioId:'custom-chart',selection:{type:'builtin',id:'custom-chart'}})));
  expect(inspections).toBe(1);
});

it("retains the real selection if the service rejects a resource scenario",async()=>{
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.endsWith('/select')
    ? new Response(JSON.stringify({error:'Resource unavailable'}),{status:400,headers:{'content-type':'application/json'}})
    : json(url.endsWith('/compatibility')?unknown:state)));
  const container=await mount();
  const card=Array.from(container.querySelectorAll('.creator-mock-scenario')).find(node=>node.querySelector('strong')?.textContent==='custom-chart')!;
  const radio=card.querySelector('input') as HTMLInputElement;
  await act(async()=>radio.click());
  expect(radio.checked).toBe(false);
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
});
