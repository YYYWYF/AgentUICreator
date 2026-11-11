// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { CreatorPluginUpdates } from "../src/ui/CreatorPluginUpdates.js";
import type { PackageUpdateOverview } from "@za38.03/agent-ui-creator/project/updates";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
afterEach(() => { if (root) act(() => root.unmount()); document.body.replaceChildren(); localStorage.clear(); vi.unstubAllGlobals(); });
const packageOverview = (): PackageUpdateOverview => ({status:"online",checkedAt:"2026-11-11T00:00:00Z",recommendedReleaseId:"next",installationSupported:true,fingerprint:"versions",packages:[{name:"@za38.03/agent-ui-plugins",scope:"project",currentVersion:"0.0.1",targetVersion:"0.0.3",updateAvailable:true,historyIncomplete:false,summary:[],history:[{id:"new",version:"0.0.3",kind:"feature",pluginId:"reload-action",summary:"最新功能"},{id:"old",version:"0.0.2",kind:"fix",pluginId:"copy-action",summary:"之前的修复"}],versions:["0.0.3","0.0.2"]}],blockedReleases:[]});
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
it("shows failed discovery as unknown, never zero updates or a compatibility decision, and recovers on retry", async () => {
  const fetcher = vi.fn(async () => Response.json({ error: "Release plugin inventory mismatch" }, { status: 409 }));
  vi.stubGlobal("fetch", fetcher);
  const { container, props } = await mount();
  await act(async () => root.render(<CreatorPluginUpdates {...props} pageOpen checkRequest={0} />));
  expect(container.textContent).toContain("暂时无法确认更新状态");
  expect(container.textContent).toContain("Release plugin inventory mismatch");
  expect(container.textContent).not.toContain("0 个插件可以更新");
  expect(container.textContent).not.toContain("请先升级 Creator");
  expect(container.textContent).not.toContain("当前已是最新版本");
  fetcher.mockImplementation(async () => Response.json(inspection));
  await act(async () => root.render(<CreatorPluginUpdates {...props} pageOpen checkRequest={1} />));
  expect(container.textContent).not.toContain("Release plugin inventory mismatch");
  expect(container.textContent).toContain("有 1 项更新");
});
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
  await click(container, "查看更新"); await click(container, "更新此插件");
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
  expect(container.textContent).toContain("你接管的插件");
  await click(container,"更新此插件");
  expect(container.textContent).toContain("插件的现有设置和组合保持不变");
  await click(container,"让 Creator 合并");
  expect(props.onModelMerge).toHaveBeenCalledWith("implementation merge only");
  expect(props.onPageChange).toHaveBeenLastCalledWith(false);
});

it("shows cumulative npm changes alongside source sync without offering npm execution", async () => {
  const packageUpdates = {status:"online",checkedAt:"2026-10-18T00:00:00Z",recommendedReleaseId:"official-1.0.8",latestReleaseId:"official-1.0.8",packages:[{name:"@za38.03/agent-ui-plugins",scope:"project",currentVersion:"1.0.0",targetVersion:"1.0.8",declared:"^1.0.0",updateAvailable:true,historyIncomplete:true,summary:[{id:"counter",summary:"输入统计",kind:"feature",pluginId:"composer",versions:["1.0.8","1.0.1"]}],history:[{id:"counter",version:"1.0.8",kind:"feature",summary:"输入统计"},{id:"repair",version:"1.0.2",kind:"fix",summary:"修复历史问题"}]}],blockedReleases:[],installationSupported:false,fingerprint:"packages"};
  const routes:string[]=[];
  vi.stubGlobal("fetch",vi.fn(async(url:string)=>{routes.push(url);return new Response(JSON.stringify({...inspection,packageUpdates}));}));
  const {container}=await mount();await click(container,"查看更新");
  expect(container.textContent).toContain("更新中心");expect(container.textContent).toContain("官方插件");expect(container.textContent).toContain("有 2 项更新");expect(container.textContent).toContain("当前 1.0.0");expect(container.querySelector('.creator-official-plugins .creator-release-heading')?.textContent).toContain("1.0.8");expect(container.textContent).toContain("查看之前 1 个版本的更新");expect(container.textContent).toContain("1.0.2");expect(container.textContent).toContain("部分版本没有提供更新说明");expect(container.textContent).toContain("当前安装方式暂不支持一键升级");expect(container.textContent).toContain("更新此插件");expect(routes.some(route=>route.endsWith("/execute"))).toBe(false);
});

it("separates owned-plugin changes from package notes and keeps unchanged owned source visible", async () => {
  const plugin = { ...inspection.plugins[0], pluginId: "composer", name: "Composer", delivery: "source-owned", packageVersion: "1.0.0", currentVersion: "0.2.0", targetVersion: "0.2.0", updateAvailable: false, changelog: [] };
  const ownedChange = { id: "composer", summary: "Owned composer feature", kind: "feature", pluginId: "composer", version: "1.0.8" };
  const normalChange = { id: "copy", summary: "Default copy improvement", kind: "fix", pluginId: "copy-action", version: "1.0.8" };
  const commonChange = { id: "api", summary: "Shared API migration", kind: "breaking", version: "1.0.8" };
  const packageUpdates = { status: "online", checkedAt: "2026-10-18T00:00:00Z", recommendedReleaseId: "next", packages: [{ name: "@za38.03/agent-ui-plugins", scope: "project", currentVersion: "1.0.0", targetVersion: "1.0.8", updateAvailable: true, historyIncomplete: false,
    summary: [ownedChange, normalChange, commonChange].map(change => ({ ...change, versions: [change.version] })), history: [ownedChange, normalChange, commonChange] }], blockedReleases: [], installationSupported: true, fingerprint: "owned-separate" };
  const routes: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => { routes.push(url); return Response.json({ ...inspection, plugins: [plugin], packageUpdates }); }));
  const { container } = await mount(); await click(container, "查看更新");
  const overview = container.querySelector('.creator-package-overview')!;
  expect(overview.textContent).not.toContain("Owned composer feature");
  expect(overview.textContent).toContain("Default copy improvement");
  expect(overview.textContent).toContain("Shared API migration");
  expect(overview.textContent).not.toContain("已采用源码");
  const card = container.querySelector<HTMLElement>('.creator-update-plugin-card')!;
  expect(card.textContent).toContain("Owned composer feature");
  expect(card.textContent).toContain("先更新上方的官方插件");
  expect(card.textContent).not.toContain("暂无待更新内容");
  expect(card.textContent).toContain("当前 0.2.0");
  expect(card.querySelector('.creator-update-plan-entry')).toBeNull();
  expect(routes.some(route => /\/(plan|execute|merge|adopt)$/.test(route))).toBe(false);
});

it("keeps adopted and installed official plugin versions visible after the npm package is up to date", async () => {
  const plugin = { ...inspection.plugins[0], name: "Composer", pluginId: "composer", delivery: "source-owned", packageVersion: "1.0.8", currentVersion: "0.2.0", targetVersion: "0.3.0" };
  const packageUpdates = { status: "online", checkedAt: "2026-10-18T00:00:00Z", recommendedReleaseId: "next", packages: [{ name: "@za38.03/agent-ui-plugins", scope: "project", currentVersion: "1.0.8", targetVersion: "1.0.8", updateAvailable: false, historyIncomplete: false, summary: [], history: [] }], blockedReleases: [], installationSupported: true, fingerprint: "installed" };
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ...inspection, plugins: [plugin], packageUpdates })));
  const { container } = await mount(); await click(container, "查看更新");
  expect(container.querySelector('.creator-package-overview')?.textContent).toContain("已是最新");
  expect(container.querySelector('.creator-update-plugin-card [data-slot="card-description"]')?.textContent).toBe("当前 0.2.0");
  expect(container.querySelector('.creator-update-plugin-card .creator-release-heading')?.textContent).toContain("0.3.0");
  expect(container.querySelector('.creator-update-plugin-card')?.textContent).toContain("更新此插件");
  expect(container.querySelector('.creator-prepare-upgrade')).toBeNull();
});

it.each(["cached","unavailable","unconfigured"])("does not claim already up to date with %s online discovery",async(status)=>{
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({...inspection,plugins:[],packageUpdates:{status,checkedAt:"2026-10-18T00:00:00Z",packages:[],blockedReleases:[],installationSupported:false,fingerprint:"unknown"}}))));
  const {container,props}=await mount();await act(async()=>root.render(<CreatorPluginUpdates {...props} checkRequest={1}/>));expect(container.textContent).not.toContain("当前已是最新版本");expect(container.textContent).toContain("未能确认最新兼容版本");
  await act(async()=>root.render(<CreatorPluginUpdates {...props} pageOpen checkRequest={1}/>));
  expect(container.querySelector(".creator-update-page-meta")?.textContent).toContain("暂时无法确认更新状态");
  expect(container.querySelector(".creator-update-page-meta")?.textContent).not.toContain("有 0 项更新");
});
it("shows a bound npm plan and installs only after separate user confirmation, then refreshes source updates",async()=>{
 const routes:{url:string;body:any}[]=[];
 const packageUpdates={status:"online",checkedAt:"2026-10-18T00:00:00Z",installationSupported:true,fingerprint:"npm",packages:[{name:"@za38.03/agent-ui-plugins",scope:"project",currentVersion:"0.0.1",targetVersion:"0.0.2",updateAvailable:true,summary:[],history:[]}],blockedReleases:[]};
 vi.stubGlobal("fetch",vi.fn(async(url:string,init:RequestInit)=>{
   routes.push({url,body:JSON.parse(init.body as string)});
   return new Response(JSON.stringify(url.endsWith("/packages/plan")?{id:"npm-bound",releaseId:"next",manager:"npm",lockfile:"package-lock.json",packages:[{name:"@za38.03/agent-ui-plugins",current:"0.0.1",target:"0.0.2"}],checks:["typecheck","build"]}:url.endsWith("/packages/execute")?{status:"installed",checks:["typecheck","build"]}:{...inspection,packageUpdates}));
 }));
 const {container}=await mount();await click(container,"查看更新");await click(container,"更新官方插件");
 expect(container.textContent).toContain("你接管的插件和项目修改会保留");expect(routes.some(r=>r.url.endsWith("/packages/execute"))).toBe(false);
 await click(container,"确认更新");expect(routes.find(r=>r.url.endsWith("/packages/execute"))?.body).toEqual({workspaceId:"project",planId:"npm-bound",confirmed:true});
 expect(routes.some(r=>/\/(merge|adopt|execute)$/.test(r.url)&&!r.url.includes("/packages/"))).toBe(false);expect(container.textContent).toContain("官方插件已更新至 0.0.2");
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
 await click(container,"更新官方插件");
 const plan=container.querySelector(".creator-package-plan")!;expect(document.activeElement).toBe(plan);
 expect(plan.querySelector(".creator-plan-packages")?.textContent).toContain("官方插件");
 expect(plan.querySelector(".creator-plan-packages")?.textContent).not.toContain("core");
 expect(plan.textContent).not.toContain("core · 0.0.1");
 expect(plan.textContent).not.toContain("package-lock.json");
 await click(container,"稍后");expect(container.querySelector(".creator-package-plan")).toBeNull();
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
 const {container}=await mount();await click(container,"查看更新");await click(container,"更新此插件");
 expect(container.textContent).toContain("不会直接覆盖");expect(container.textContent).not.toContain("source-lock");
 await click(container,"自行合并");
 const comparison=container.querySelector(".creator-source-diff")!;expect(comparison.hasAttribute("open")).toBe(false);
 expect(comparison.textContent).toContain("你的当前代码");expect(comparison.textContent).not.toContain("BASE");
 expect(routes.some(r=>r.url.endsWith("/adopt")||r.url.endsWith("/execute"))).toBe(false);
 await click(container,"验证并完成同步");expect(container.textContent).toContain("尚有源码冲突未合并");expect(container.querySelector(".creator-source-diff")).not.toBeNull();
 valid=true;await click(container,"验证并完成同步");
 expect(routes.filter(r=>r.url.endsWith("/adopt")).every(r=>r.body.planId==="source-review"&&r.body.confirmed===true)).toBe(true);
 expect(container.textContent).toContain("已更新至 0.0.2，工程检查通过");expect(container.querySelector(".creator-source-diff")).toBeNull();
});

it("opens only the latest release and groups previous changes by version without downgrade warnings", async () => {
 const packages={...packageOverview(),blockedReleases:[{id:"old-combination",issues:[{code:"downgrade",name:"@za38.03/agent-ui-plugins",actual:"0.0.1",required:"0.0.0"}]}]};
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json({...inspection,plugins:[],packageUpdates:packages})));
 const {container}=await mount();await click(container,"查看更新");
 const latest=container.querySelector('.creator-official-plugins .creator-release-list > .creator-release')!;
 expect(latest.textContent).toContain("最新功能");expect(latest.textContent).not.toContain("之前的修复");
 const history=container.querySelector<HTMLDetailsElement>('.creator-official-plugins .creator-release-history')!;
 expect(history.open).toBe(false);expect(history.textContent).toContain("0.0.2");expect(history.textContent).toContain("之前的修复");
 expect(container.textContent).not.toContain("不推荐降级");expect(container.querySelector('.creator-update-blocked')).toBeNull();
 await act(async()=>history.querySelector('summary')!.click());expect(history.open).toBe(true);
});

it("shows real streamed installation stages, prevents repeat confirmation, and reports the completed version", async () => {
 let controller:ReadableStreamDefaultController<Uint8Array>;
 let installed=false;let executions=0;
 const encoder=new TextEncoder();
 vi.stubGlobal("fetch",vi.fn(async(url:string)=>{
  if(url.endsWith('/packages/plan'))return Response.json({id:"stream-plan",packages:[{name:"@za38.03/agent-ui-plugins",current:"0.0.1",target:"0.0.3"}],checks:["typecheck","build"]});
  if(url.endsWith('/packages/execute')){executions++;return new Response(new ReadableStream<Uint8Array>({start(value){controller=value;}}),{headers:{"Content-Type":"application/x-ndjson"}});}
  const overview=packageOverview();if(installed)Object.assign(overview.packages[0]!,{currentVersion:"0.0.3",updateAvailable:false});
  return Response.json({...inspection,plugins:[],packageUpdates:overview});
 }));
 const {container}=await mount();await click(container,"查看更新");await click(container,"更新官方插件");await click(container,"确认更新");
 expect(container.textContent).toContain("更新中…");
 const button=[...container.querySelectorAll('button')].find(button=>button.textContent==='更新中…')!;
 expect(button.disabled).toBe(true);await act(async()=>button.click());expect(executions).toBe(1);
 await act(async()=>controller.enqueue(encoder.encode('{"stage":"installing"}\n')));expect(container.textContent).toContain("正在安装更新…");
 await act(async()=>controller.enqueue(encoder.encode('{"stage":"check')));
 await act(async()=>controller.enqueue(encoder.encode('ing"}\n')));expect(container.textContent).toContain("正在检查工程…");
 installed=true;await act(async()=>{controller.enqueue(encoder.encode('{"result":{"status":"installed","checks":["typecheck","build"]}}\n'));controller.close();});
 expect(container.textContent).toContain("官方插件已更新至 0.0.3");expect(container.textContent).not.toContain("更新中…");
 expect(container.textContent).not.toContain("已采用源码");expect(container.querySelector('.creator-release-history')?.textContent).toContain("查看版本记录");
});

it("does not report success when the installation stream ends without a result", async()=>{
 vi.stubGlobal("fetch",vi.fn(async(url:string)=>url.endsWith('/packages/execute')?new Response('{"stage":"installing"}\n',{headers:{"Content-Type":"application/x-ndjson"}}):Response.json(url.endsWith('/packages/plan')?{id:"interrupted",packages:[],checks:[]}:{...inspection,plugins:[],packageUpdates:packageOverview()})));
 const {container}=await mount();await click(container,"查看更新");await click(container,"更新官方插件");await click(container,"确认更新");
 expect(container.textContent).toContain("更新未完成");expect(container.textContent).not.toContain("已更新至");expect(container.textContent).toContain("重新查看更新");
});

it("keeps an owned-plugin confirmation busy until completion and replaces version comparison with a clear result",async()=>{
 let complete!:(response:Response)=>void;let updated=false;
 const source={...inspection.plugins[0],pluginId:"copy-action",name:"Conversation Copy Action",delivery:"source-owned",currentVersion:"0.0.1",targetVersion:"0.0.3",changelog:[{version:"0.0.3",entry:{summary:"复制反馈",changes:["新版功能"]}},{version:"0.0.2",entry:{summary:"早期修复",changes:["之前功能"]}}]};
 vi.stubGlobal("fetch",vi.fn(async(url:string)=>{
  if(url.endsWith('/plan'))return Response.json({id:"owned-plan",kind:"owned-source",requiresMerge:false,blocked:false,compatibility:"compatible",items:[],issues:[],requestedPlugins:["copy-action"]});
  if(url.endsWith('/execute'))return new Promise<Response>(resolve=>{complete=resolve;});
  return Response.json({...inspection,plugins:[updated?{...source,currentVersion:"0.0.3",updateAvailable:false}:source]});
 }));
 const {container}=await mount();await click(container,"查看更新");
 const card=container.querySelector('.creator-update-plugin-card')!;
 expect(card.querySelector('.creator-release-list > .creator-release')?.textContent).toContain("新版功能");
 expect(card.querySelector<HTMLDetailsElement>('.creator-release-history')?.open).toBe(false);
 await click(container,"更新此插件");await click(container,"确认更新");
 expect(card.textContent).toContain("正在更新插件并检查工程");expect([...card.querySelectorAll('button')].find(button=>button.textContent==='更新中…')?.disabled).toBe(true);
 updated=true;await act(async()=>complete(Response.json({updatedItems:["copy-action"],adopted:true})));
 expect(card.textContent).toContain("Conversation Copy Action已更新至 0.0.3，工程检查通过");
 expect(card.querySelector('[data-slot="card-description"]')).toBeNull();
 expect(card.textContent).not.toContain("已采用源码");expect(card.textContent).not.toContain("已安装包内官方版本");
});

it("keeps automatic dependency versions out of feature notes and puts exact changes in optional confirmation details",async()=>{
 const packageUpdates=packageOverview();packageUpdates.packages.push({...packageUpdates.packages[0]!,name:"@za38.03/agent-ui-runtime",summary:[],history:[]});
 vi.stubGlobal("fetch",vi.fn(async(url:string)=>Response.json(url.endsWith('/packages/plan')?{id:"dependencies",packages:packageUpdates.packages.map(pkg=>({name:pkg.name,current:pkg.currentVersion,target:pkg.targetVersion})),checks:[]}:{...inspection,plugins:[],packageUpdates})));
 const {container}=await mount();await click(container,"查看更新");
 const main=container.querySelector('.creator-official-plugins')!;
 expect(main.textContent).not.toContain("查看关联组件");expect(main.textContent).not.toContain("会话运行支持");
 expect(main.querySelectorAll('.creator-release-list')).toHaveLength(1);
 await click(container,"更新官方插件");
 const plan=container.querySelector('.creator-package-plan')!;
 expect(plan.textContent).toContain("无需你单独操作");
 const details=plan.querySelector<HTMLDetailsElement>('.creator-dependency-details')!;
 expect(details.open).toBe(false);expect(details.textContent).toContain("@za38.03/agent-ui-runtime");expect(details.textContent).toContain("0.0.1 → 0.0.3");
 expect(details.textContent).not.toContain("此版本未提供更新说明");expect(details.querySelector('.creator-release-list')).toBeNull();
});

it("keeps required dependency migrations visible even though technical dependency cards are removed",async()=>{
 const packageUpdates=packageOverview();const change={id:"runtime-migration",version:"0.0.3",summary:"更新前需要适配会话接口",kind:"breaking" as const,versions:["0.0.3"]};
 packageUpdates.packages.push({...packageUpdates.packages[0]!,name:"@za38.03/agent-ui-runtime",summary:[change],history:[change]});
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json({...inspection,plugins:[],packageUpdates})));
 const {container}=await mount();await click(container,"查看更新");
 const notice=container.querySelector('[role="note"]')!;expect(notice.textContent).toContain("更新前需要适配会话接口");expect(notice.closest('details')).toBeNull();
});

it("groups publisher notes by Plugin identity, uses manifest names, and keeps other package notes collapsed until requested",async()=>{
 const packageUpdates=packageOverview();const plugins=packageUpdates.packages[0]!;
 plugins.history=[{id:"first",version:"0.0.3",kind:"feature",pluginId:"reload-action",summary:"支持中止后重新生成"},{id:"second",version:"0.0.3",kind:"fix",pluginId:"reload-action",summary:"修复连续点击状态"},{id:"package-only",version:"0.0.3",kind:"fix",summary:"优化包内资源体积"}];
 plugins.summary=plugins.history.map(change=>({id:change.id,summary:change.summary,kind:change.kind,...(change.pluginId?{pluginId:change.pluginId}:{}),versions:[change.version]}));
 packageUpdates.packages.push({...plugins,name:"@za38.03/agent-ui-runtime",history:[{id:"runtime-note",version:"0.0.3",kind:"fix",summary:"修复会话状态恢复"}],summary:[]});
 const routes:string[]=[];
 vi.stubGlobal("fetch",vi.fn(async(url:string)=>{routes.push(url);return Response.json({...inspection,plugins:[],pluginNames:{"reload-action":"Conversation Reload Action"},packageUpdates});}));
 const {container}=await mount();await click(container,"查看更新");
 const main=container.querySelector('.creator-official-plugins')!;
 const group=main.querySelector('[data-plugin-id="reload-action"]')!;
 expect(group.querySelector('h4')?.textContent).toBe("Conversation Reload Action");expect(group.querySelectorAll('li')).toHaveLength(2);
 expect(main.querySelectorAll('[data-plugin-id="reload-action"]')).toHaveLength(1);
 expect(main.textContent).not.toContain("重新生成回复");expect(main.textContent).not.toContain("优化包内资源体积");expect(main.textContent).not.toContain("修复会话状态恢复");
 const other=container.querySelector<HTMLDetailsElement>('.creator-other-update-notes')!;expect(other.open).toBe(false);
 await act(async()=>other.querySelector('summary')!.click());expect(other.open).toBe(true);expect(other.textContent).toContain("优化包内资源体积");expect(other.textContent).toContain("修复会话状态恢复");
 expect(routes.some(route=>/\/(plan|execute|merge|adopt)$/.test(route))).toBe(false);
});

it("keeps an unknown Plugin ID visible instead of inventing a name for a newly published Plugin",async()=>{
 const packageUpdates=packageOverview();packageUpdates.packages[0]!.history=[{id:"new-plugin",pluginId:"newly-published-plugin",version:"0.0.3",kind:"feature",summary:"发布者提供的功能说明"}];
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json({...inspection,plugins:[],pluginNames:{},packageUpdates})));
 const {container}=await mount();await click(container,"查看更新");
 expect(container.querySelector('[data-plugin-id="newly-published-plugin"] h4')?.textContent).toBe("newly-published-plugin");
 expect(container.querySelector('[data-plugin-id="newly-published-plugin"]')?.textContent).toContain("发布者提供的功能说明");
});
