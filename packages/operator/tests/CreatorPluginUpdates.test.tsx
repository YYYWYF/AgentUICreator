// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { CreatorPluginUpdates } from "../src/ui/CreatorPluginUpdates.js";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
afterEach(() => { if (root) act(() => root.unmount()); document.body.replaceChildren(); localStorage.clear(); vi.unstubAllGlobals(); });
const inspection = { releaseVersion: "0.0.2", compatibility: "compatible", fingerprint: "surface@0.0.2", plugins: [{ pluginId: "conversation-surface", name: "Conversation Surface", currentVersion: "0.0.1", targetVersion: "0.0.2", sourceRelease: "0.0.1", status: "managed", updateAvailable: true, changelog: [{ version: "0.0.2", entry: { summary: "更新", changes: ["修复显示"] } }] }] };
async function mount(counter = 0) {
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  const props = { workspaceId: "project", busy: false, modelReady: true, onPageChange: vi.fn(), onModelMerge: vi.fn() };
  await act(async () => root.render(<CreatorPluginUpdates {...props} checkRequest={counter} />));
  return { container, props };
}
async function click(container: HTMLElement, text: string) {
  const button = [...container.querySelectorAll("button")].find(button => (button.getAttribute("aria-label") ?? button.textContent) === text)!;
  await act(async () => button.click());
}
it("dismisses the same update set but manual checks still reveal it, and new sets notify again", async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify(inspection))); vi.stubGlobal("fetch", fetch);
  const { container, props } = await mount();
  expect(container.textContent).toContain("有 1 个插件可以更新");
  await click(container, "查看更新");
  await act(async () => { (container.querySelector('[aria-label="关闭插件更新提示"]') as HTMLButtonElement).click(); });
  act(() => root.unmount());
  root = createRoot(container);
  await act(async () => root.render(<CreatorPluginUpdates {...props} checkRequest={0} />));
  expect(container.textContent).not.toContain("有 1 个插件可以更新");
  await act(async () => root.render(<CreatorPluginUpdates {...props} checkRequest={1} />));
  expect(container.textContent).toContain("插件更新");
  await act(async () => { (container.querySelector('[aria-label="返回"]') as HTMLButtonElement).click(); });
  fetch.mockImplementation(async () => new Response(JSON.stringify({ ...inspection, fingerprint: "surface@0.0.3" })));
  act(() => root.unmount()); root = createRoot(container);
  await act(async () => root.render(<CreatorPluginUpdates {...props} checkRequest={1} />));
  expect(container.textContent).toContain("有 1 个插件可以更新");
});
it("does not execute until the displayed dependency plan is explicitly confirmed", async () => {
  const routes: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    routes.push(url);
    return new Response(JSON.stringify(url.endsWith("/plan") ? { id: "plan", releaseVersion: "0.0.2", compatibility: "compatible", requiresMerge: false, blocked: false, fileCount: 8, issues: [], requestedPlugins: ["conversation-surface"], items: [{ itemId: "foundation/core", status: "managed", changed: true, provided: false, currentVersion: null, targetVersion: null, paths: ["index.ts"] }] } : inspection));
  }));
  const { container } = await mount();
  await click(container, "查看更新"); await click(container, "查看更新内容");
  expect(container.textContent).toContain("foundation/core");
  const region = container.querySelector<HTMLElement>('[aria-label="更新方案"]')!;
  expect(region.closest(".creator-update-plugin-card")?.textContent).toContain("Conversation Surface");
  expect(document.activeElement).toBe(region);
  expect(routes.some(route => route.endsWith("/execute"))).toBe(false);
  await click(container, "确认更新");
  expect(routes.filter(route => route.endsWith("/execute"))).toHaveLength(1);
});

it("shows source ownership, preserves the application boundary and hands model merge back to chat", async () => {
  const owned = {...inspection,plugins:[{...inspection.plugins[0],pluginId:"composer",delivery:"source-owned",packageVersion:"0.0.2",status:"customized"}]};
  vi.stubGlobal("fetch",vi.fn(async (url:string)=>new Response(JSON.stringify(url.endsWith("/plan") ? {id:"owned",kind:"owned-source",compatibility:"compatible",requiresMerge:true,blocked:false,fileCount:1,issues:[],items:[],requestedPlugins:["composer"]} : url.endsWith("/merge") ? {prompt:"implementation merge only",files:[{path:"plugins/composer/source/adapters/composer.tsx",base:"BASE",local:"LOCAL",target:"TARGET"}]} : owned))));
  const {container,props}=await mount();
  await click(container,"查看更新");
  expect(container.textContent).toContain("项目托管源码");
  await click(container,"查看同步方案");
  expect(container.textContent).toContain("应用层的属性和组合保持不变");
  await click(container,"让 Creator 合并");
  expect(props.onModelMerge).toHaveBeenCalledWith("implementation merge only");
  expect(props.onPageChange).toHaveBeenLastCalledWith(false);
});

it("shows cumulative npm changes alongside source sync without offering npm execution", async () => {
  const packageUpdates = {status:"online",checkedAt:"2026-10-18T00:00:00Z",recommendedReleaseId:"official-1.0.8",latestReleaseId:"official-1.0.8",packages:[{name:"@za38.03/agent-ui-plugins",scope:"project",currentVersion:"1.0.0",targetVersion:"1.0.8",declared:"^1.0.0",updateAvailable:true,historyIncomplete:true,summary:[{id:"counter",summary:"输入统计",kind:"feature",pluginId:"composer",versions:["1.0.8","1.0.1"]}],history:[{id:"counter",version:"1.0.8",kind:"feature",summary:"输入统计"},{id:"repair",version:"1.0.2",kind:"fix",summary:"修复历史问题"}]}],blockedReleases:[],installationSupported:false,fingerprint:"packages"};
  const routes:string[]=[];
  vi.stubGlobal("fetch",vi.fn(async(url:string)=>{routes.push(url);return new Response(JSON.stringify({...inspection,packageUpdates}));}));
  const {container}=await mount();await click(container,"查看更新");
  expect(container.textContent).toContain("更新中心");expect(container.textContent).toContain("本次更新");expect(container.textContent).toContain("有 2 项更新");expect(container.textContent).toContain("1.0.0 → 1.0.8");expect(container.textContent).toContain("查看逐版本变更");expect(container.textContent).toContain("1.0.2");expect(container.textContent).toContain("部分版本没有提供更新说明");expect(container.textContent).toContain("当前安装方式暂不支持一键升级");expect(container.textContent).toContain("查看更新内容");expect(routes.some(route=>route.endsWith("/execute"))).toBe(false);
});

it.each(["cached","unavailable","unconfigured"])("does not claim already up to date with %s online discovery",async(status)=>{
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({...inspection,plugins:[],packageUpdates:{status,checkedAt:"2026-10-18T00:00:00Z",packages:[],blockedReleases:[],installationSupported:false,fingerprint:"unknown"}}))));
  const {container,props}=await mount();await act(async()=>root.render(<CreatorPluginUpdates {...props} checkRequest={1}/>));expect(container.textContent).not.toContain("当前已是最新版本");expect(container.textContent).toContain("未能确认最新兼容版本");
});
it("shows a bound npm plan and installs only after separate user confirmation, then refreshes source updates",async()=>{
 const routes:{url:string;body:any}[]=[];
 const packageUpdates={status:"online",checkedAt:"2026-10-18T00:00:00Z",installationSupported:true,fingerprint:"npm",packages:[{name:"@za38.03/agent-ui-plugins",scope:"project",currentVersion:"0.0.1",targetVersion:"0.0.2",updateAvailable:true,summary:[],history:[]}],blockedReleases:[]};
 vi.stubGlobal("fetch",vi.fn(async(url:string,init:RequestInit)=>{
   routes.push({url,body:JSON.parse(init.body as string)});
   return new Response(JSON.stringify(url.endsWith("/packages/plan")?{id:"npm-bound",releaseId:"next",manager:"npm",lockfile:"package-lock.json",packages:[{name:"@za38.03/agent-ui-plugins",current:"0.0.1",target:"0.0.2"}],checks:["typecheck","build"]}:url.endsWith("/packages/execute")?{status:"installed",checks:["typecheck","build"]}:{...inspection,packageUpdates}));
 }));
 const {container}=await mount();await click(container,"查看更新");await click(container,"准备升级");
 expect(container.textContent).toContain("你的应用层和已托管源码都会保留");expect(routes.some(r=>r.url.endsWith("/packages/execute"))).toBe(false);
 await click(container,"确认升级");expect(routes.find(r=>r.url.endsWith("/packages/execute"))?.body).toEqual({workspaceId:"project",planId:"npm-bound",confirmed:true});
 expect(routes.some(r=>/\/(merge|adopt|execute)$/.test(r.url)&&!r.url.includes("/packages/"))).toBe(false);expect(container.textContent).toContain("依赖已升级并通过验证");
});
it("offers explicit recovery when an interrupted install prevents normal dependency inspection",async()=>{
 const routes:string[]=[];vi.stubGlobal("fetch",vi.fn(async(url:string)=>{routes.push(url);return new Response(JSON.stringify(url.endsWith("/packages/recover")?{status:"restored",checks:[]}:{...inspection,plugins:[],packageUpdates:{status:"unavailable",checkedAt:"now",packages:[],blockedReleases:[],installationSupported:true,fingerprint:"recovery",recovery:{id:"pending",state:"recovery-required"}}}));}));
 const {container}=await mount();await click(container,"查看更新");await click(container,"重试恢复原依赖");expect(routes.some(r=>r.endsWith("/packages/recover"))).toBe(true);expect(container.textContent).toContain("原依赖文件和实际安装版本已恢复");
});

it("keeps unchanged packages secondary and focuses the separately confirmed npm plan", async () => {
 const packageUpdates={status:"online",checkedAt:"2026-10-18T00:00:00Z",recommendedReleaseId:"next",installationSupported:true,fingerprint:"compact",packages:[{name:"@za38.03/agent-ui-core",scope:"project",currentVersion:"0.0.1",targetVersion:"0.0.1",updateAvailable:false,summary:[],history:[]},{name:"@za38.03/agent-ui-plugins",scope:"project",currentVersion:"0.0.1",targetVersion:"0.0.2",updateAvailable:true,summary:[],history:[]}],blockedReleases:[]};
 const routes:string[]=[];
 vi.stubGlobal("fetch",vi.fn(async(url:string)=>{routes.push(url);return new Response(JSON.stringify(url.endsWith("/packages/plan")?{id:"review",manager:"npm",lockfile:"package-lock.json",packages:[{name:"@za38.03/agent-ui-core",current:"0.0.1",target:"0.0.1"},{name:"@za38.03/agent-ui-plugins",current:"0.0.1",target:"0.0.2"}],checks:[]}:{...inspection,plugins:[],packageUpdates}));}));
 const {container}=await mount();await click(container,"查看更新");
 expect(container.querySelector(".creator-current-packages")).toBeNull();
 expect(container.textContent).not.toContain("兼容版本清单");
 expect(container.textContent).not.toContain("依赖声明");
 await click(container,"准备升级");
 const plan=container.querySelector(".creator-package-plan")!;expect(document.activeElement).toBe(plan);
 expect(plan.querySelector(".creator-plan-packages")?.textContent).toContain("界面组件");
 expect(plan.querySelector(".creator-plan-packages")?.textContent).not.toContain("core");
 expect(plan.textContent).not.toContain("core · 0.0.1");
 expect(plan.textContent).not.toContain("package-lock.json");
 await click(container,"暂不升级");expect(container.querySelector(".creator-package-plan")).toBeNull();
 expect(routes.some(url=>url.endsWith("/packages/execute"))).toBe(false);
});

it("keeps code comparison optional and requires validation before finishing a source merge", async () => {
 const owned={...inspection,plugins:[{...inspection.plugins[0],pluginId:"composer",delivery:"source-owned",status:"customized"}]};
 const routes:{url:string;body:any}[]=[];let valid=false;
 vi.stubGlobal("fetch",vi.fn(async(url:string,init:RequestInit)=>{
  routes.push({url,body:JSON.parse(init.body as string)});
  if(url.endsWith("/adopt")&&!valid)return new Response(JSON.stringify({error:"PLUGIN_SOURCE_MERGE_UNRESOLVED"}),{status:409});
  return new Response(JSON.stringify(url.endsWith("/plan")?{id:"source-review",kind:"owned-source",compatibility:"compatible",requiresMerge:true,blocked:false,fileCount:1,issues:[],items:[],requestedPlugins:["composer"]}:url.endsWith("/merge")?{files:[{path:"plugins/composer/source/adapters/composer.tsx",base:"oldCode",local:"customCode",target:"newCode"}]}:url.endsWith("/adopt")?{}:owned));
 }));
 const {container}=await mount();await click(container,"查看更新");await click(container,"查看同步方案");
 expect(container.textContent).toContain("不会直接覆盖");expect(container.textContent).not.toContain("source-lock");
 await click(container,"自行合并");
 const comparison=container.querySelector(".creator-source-diff")!;expect(comparison.hasAttribute("open")).toBe(false);
 expect(comparison.textContent).toContain("你的当前代码");expect(comparison.textContent).not.toContain("BASE");
 expect(routes.some(r=>r.url.endsWith("/adopt")||r.url.endsWith("/execute"))).toBe(false);
 await click(container,"验证并完成同步");expect(container.textContent).toContain("尚有源码冲突未合并");expect(container.querySelector(".creator-source-diff")).not.toBeNull();
 valid=true;await click(container,"验证并完成同步");
 expect(routes.filter(r=>r.url.endsWith("/adopt")).every(r=>r.body.planId==="source-review"&&r.body.confirmed===true)).toBe(true);
 expect(container.textContent).toContain("源码已同步，检查通过");expect(container.querySelector(".creator-source-diff")).toBeNull();
});
