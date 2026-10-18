import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { inspectPluginSharedTypes, resolveSharedDeclaration } from "../src/project/plugin-shared-types";
import { inspectPluginApplication } from "../src/project/plugin-application-inspector";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, {recursive:true,force:true}))); });
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "application-api-中文 "));
  roots.push(root);
  const pkg = path.join(root,"node_modules/@za38.03/agent-ui-plugins");
  await mkdir(path.join(pkg,"dist"),{recursive:true});
  await mkdir(path.join(root,"src/plugins/sample"),{recursive:true});
  await writeFile(path.join(root,"package.json"),'{}');
  await writeFile(path.join(root,"tsconfig.json"),JSON.stringify({compilerOptions:{strict:true,module:"ESNext",moduleResolution:"Bundler"},include:["src"]}));
  await writeFile(path.join(pkg,"package.json"),JSON.stringify({name:"@za38.03/agent-ui-plugins",version:"4.2.1",exports:{"./catalog.json":"./dist/catalog.json","./sample":{types:"./sample.d.ts"}}}));
  await writeFile(path.join(pkg,"dist/catalog.json"),JSON.stringify({package:{name:"@za38.03/agent-ui-plugins",version:"4.2.1"},plugins:[{id:"sample",application:{component:"Sample"}}]}));
  await writeFile(path.join(pkg,"sample.d.ts"),'export interface SampleProps { defaultOpen?: boolean; options?: { open: boolean; onChange: (value: boolean) => void }; children?: string }');
  await writeFile(path.join(root,"src/plugins/sample/index.tsx"),'import type {SampleProps} from "@za38.03/agent-ui-plugins/sample"; export function Sample(props: SampleProps) { return null; }');
  return {root,asset:{pluginId:"sample",application:{entryPath:"src/plugins/sample/index.tsx",implementationOwnership:"npm" as const,implementationImport:"@za38.03/agent-ui-plugins/sample"}}};
}
it("resolves installed props and nested seams without extracting implementation or changing application",async()=>{
  const {root,asset}=await fixture();
  const before=await readFile(path.join(root,asset.application.entryPath),'utf8');
  const result=await inspectPluginApplication(root,asset);
  expect(result?.entryPath).toBe("src/plugins/sample/index.tsx");
  expect(result?.publicApi).toMatchObject({status:"available",package:{version:"4.2.1"},completePropNames:true});
  const contract=JSON.stringify(result);
  expect(contract).toContain('defaultOpen');expect(contract).toContain('onChange');
  expect(contract).not.toContain('renderStep');
  expect(await readFile(path.join(root,asset.application.entryPath),'utf8')).toBe(before);
});
it("reports unresolved application contracts rather than inventing unsupported capability",async()=>{
  const {root,asset}=await fixture();
  await writeFile(path.join(root,asset.application.entryPath),'export const different = 1;');
  const result=await inspectPluginApplication(root,asset);
  expect(result?.publicApi.status).toBe("unavailable");
  expect(result?.publicApi.interpretation).toContain("not evidence");
});

it("queries installed shared interfaces and function return shapes without source extraction",async()=>{
 const {root,asset}=await fixture();
 const pkg=path.join(root,"node_modules/@za38.03/agent-ui-plugins");
 const packageFile=path.join(pkg,"package.json");
 const metadata=JSON.parse(await readFile(packageFile,"utf8"));
 metadata.exports["./plugin-support"]={types:"./support.d.ts"};
 await writeFile(packageFile,JSON.stringify(metadata));
 await writeFile(path.join(pkg,"support.d.ts"),'export interface TimelineCall {toolCallId:string;index:number;status:string} export function projection(): {calls: TimelineCall[];detailIndices:number[]};');
 const result=await inspectPluginApplication(root,asset,["TimelineCall","projection","UnknownExport"]);
 expect(result?.sharedTypes).toMatchObject({status:"available",packageVersion:"4.2.1"});
 expect(result?.sharedTypes).toMatchObject({queryResolution:{status:"partial",requested:3,resolved:2,unresolved:1}});
 const text=JSON.stringify(result?.sharedTypes);
 expect(text).toContain('toolCallId');expect(text).toContain('detailIndices');
 expect(text).toContain('Not exported');expect(text).not.toContain('contentBase64');
});

it("distinguishes a readable module from unresolved queries and suggests only actual exports",async()=>{
 const {root,asset}=await fixture();
 const pkg=path.join(root,"node_modules/@za38.03/agent-ui-plugins");
 const metadata=JSON.parse(await readFile(path.join(pkg,"package.json"),"utf8"));
 metadata.exports["./plugin-support"]={types:"./support.d.ts"};
 await writeFile(path.join(pkg,"package.json"),JSON.stringify(metadata));
 await writeFile(path.join(pkg,"support.d.ts"),'export interface DocumentCommandRegistry {execute():void} export interface Unrelated {id:string}');
 const result=await inspectPluginApplication(root,asset,["DocumentSlashCommand"]);
 expect(result?.sharedTypes).toMatchObject({status:"available",queryResolution:{status:"unresolved",requested:1,resolved:0,unresolved:1},symbols:[{status:"unavailable",exportedNameSuggestions:["DocumentCommandRegistry"]}]});
 expect(result?.publicApi).toHaveProperty("evidenceBoundary");
});

it("keeps logical export paths inside Windows drive and UNC installations",()=>{
 for (const root of ["C:/工程 with spaces/plugins", "//server/share/plugins"]) {
  expect(resolveSharedDeclaration(root,"./dist/plugin-support.d.ts",path.win32))
    .toBe(path.win32.resolve(root,"dist/plugin-support.d.ts"));
  expect(()=>resolveSharedDeclaration(root,"./../../outside.d.ts",path.win32)).toThrow("escapes");
  expect(()=>resolveSharedDeclaration(root,"./dist/../..\\outside.d.ts",path.win32)).toThrow("unavailable");
 }
});

it("resolves bounded public members, callback parameters, return and array element types",async()=>{
  const {root,asset}=await fixture();
  const pkg=path.join(root,"node_modules/@za38.03/agent-ui-plugins");
  const meta=JSON.parse(await readFile(path.join(pkg,"package.json"),"utf8"));
  meta.exports["./plugin-support"]={types:"./support.d.ts"};
  await writeFile(path.join(pkg,"package.json"),JSON.stringify(meta));
  await writeFile(path.join(pkg,"support.d.ts"),`
    export interface Call { id:string; result:{ok:boolean} }
    export function project():{calls:readonly Call[]};
    export function select<T>(selector:(state:{message:{parts:readonly Call[]}})=>T):T;
    export interface Messages { toolTimeline:{details:string; summary:string} }
  `);
  const result=await inspectPluginApplication(root,asset,["project.$return.calls.$element.result","select.$parameter0.$parameter0.message.parts.$element","Messages.toolTimeline","project.$return.unknown","Missing"]);
  const symbols=result?.sharedTypes?.status === "available" ? result.sharedTypes.symbols : [];
  expect(symbols?.[0]).toMatchObject({status:"available",members:[{name:"ok",type:"boolean"}]});
  expect(JSON.stringify(symbols?.[1])).toContain('"name":"result"');
  expect(JSON.stringify(symbols?.[2])).toContain('"name":"details"');
  expect(symbols?.[3]).toMatchObject({status:"unavailable"});
  expect(symbols?.[4]).toMatchObject({status:"unavailable"});
});

it("rejects expressions and filesystem paths in public contract queries",async()=>{
 const {inspectPluginSharedTypes}=await import("../src/project/plugin-shared-types");
 for(const query of ["../Runtime","Export()","A[B]","A|B","C:\\secret","A"+".member".repeat(9)]) {
  await expect(inspectPluginSharedTypes("unused",[query])).rejects.toThrow("Invalid shared symbol query");
 }
});

it("resolves a declared presentation module without exposing implementation paths",async()=>{
 const {root,asset}=await fixture();
 const pkg=path.join(root,"node_modules/@za38.03/agent-ui-plugins");
 const meta=JSON.parse(await readFile(path.join(pkg,"package.json"),"utf8"));
 meta.exports["."]={types:"./public.d.ts"};
 await writeFile(path.join(pkg,"package.json"),JSON.stringify(meta));
 await writeFile(path.join(pkg,"public.d.ts"),'interface Props {open?:boolean;onOpenChange?:(open:boolean)=>void} export const AgentUIDialog: { Root: ((props:Props)=>null) | (new(props:Props)=>object) };');
 const navigation=await inspectPluginApplication(root,asset,["AgentUIDialog","AgentUIDialog.Root"],"@za38.03/agent-ui-plugins");
 expect(navigation?.sharedTypes).toMatchObject({symbols:[
  {status:"available",parameterQueries:["AgentUIDialog.Root.$parameter0"],nextEvidence:expect.stringContaining("included")},
  {status:"available",parameterQueries:["AgentUIDialog.Root.$parameter0"]},
 ]});
 expect(JSON.stringify(navigation?.sharedTypes)).toContain('"propNames":["open","onOpenChange"]');
 const result=await inspectPluginApplication(root,asset,["AgentUIDialog.Root.$parameter0"],"@za38.03/agent-ui-plugins");
 expect(result?.sharedTypes).toMatchObject({module:"@za38.03/agent-ui-plugins",queryResolution:{status:"complete"}});
 expect(JSON.stringify(result?.sharedTypes)).toContain('"name":"open"');
 for(const invalid of ["../../secret","@za38.03/agent-ui-plugins/../private","@other/package","@za38.03/agent-ui-plugins/private"]) {
  const rejected=await inspectPluginApplication(root,asset,["AgentUIDialog"],invalid);
  expect(rejected?.sharedTypes?.status).toBe("unavailable");
 }
});

it("returns installed presentation facts only for resolved public exports and explains component query operators", async () => {
  const {root}=await fixture();
  const pkg=path.join(root,"node_modules/@za38.03/agent-ui-plugins");
  const metadata=JSON.parse(await readFile(path.join(pkg,"package.json"),"utf8"));
  metadata.exports["."]={types:"./public.d.ts"};
  await writeFile(path.join(pkg,"package.json"),JSON.stringify(metadata));
  await writeFile(path.join(pkg,"public.d.ts"),'export declare const Overlay: { Popup: (props: {open?: boolean}) => null }; export declare const Other: number;');
  const catalog=JSON.parse(await readFile(path.join(pkg,"dist/catalog.json"),"utf8"));
  catalog.publicComponents={schemaVersion:1,modules:{"@za38.03/agent-ui-plugins":{Overlay:{presentation:"Installed unstyled primitive",portal:"Own boundary",irrelevant:"must not leak"},Missing:{presentation:"not an exported API"}}}};
  await writeFile(path.join(pkg,"dist/catalog.json"),JSON.stringify(catalog));
  const result=await inspectPluginSharedTypes(root,["Overlay.Popup","Overlay.Popup.$element","Other","Missing"],"@za38.03/agent-ui-plugins");
  expect(result.symbols?.[0]).toMatchObject({status:"available",presentationContract:{presentation:"Installed unstyled primitive",portal:"Own boundary"}});
  expect(JSON.stringify(result)).not.toContain("must not leak");
  expect(result.symbols?.[1]?.reason).toContain("does not unwrap a React component");
  expect(result.symbols?.[2]).not.toHaveProperty("presentationContract");
  expect(result.symbols?.[3]).toMatchObject({status:"unavailable"});
  expect(result.symbols?.[3]).not.toHaveProperty("presentationContract");
  const repeated=await inspectPluginSharedTypes(root,["Overlay.Popup","Overlay"],"@za38.03/agent-ui-plugins");
  expect(repeated.symbols?.filter(symbol => "presentationContract" in symbol)).toHaveLength(1);
  expect(repeated.queryResolution).toMatchObject({status:"complete",resolved:2});
});
