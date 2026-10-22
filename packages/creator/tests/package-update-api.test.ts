// @vitest-environment node
import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, readFile, readdir, writeFile, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterEach, it, expect } from "vitest";
import { createCreatorUpdateHandler } from "../src/updates/update-api.js";
const servers:Server[]=[];const roots:string[]=[];
afterEach(async()=>{for(const server of servers.splice(0)){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
async function listen(server:Server){servers.push(server);await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));return `http://127.0.0.1:${(server.address() as {port:number}).port}`;}
it("connects real HTTP publisher to Creator check API, preserves local files, and keeps source updates installed-version based",async()=>{
 const root=await mkdtemp(path.join(tmpdir(),"creator-update-api-"));roots.push(root);const repo=fileURLToPath(new URL("../../..",import.meta.url));
 for(const dir of [".agent-ui","src/agent-ui/plugins","src/agent-ui/app-ui","node_modules/@za38.03"])await mkdir(path.join(root,dir),{recursive:true});
 await writeFile(path.join(root,"package.json"),JSON.stringify({dependencies:{"@za38.03/agent-ui-plugins":"0.0.1"}}));await writeFile(path.join(root,".agent-ui/project.json"),JSON.stringify({mode:"assistant",sourceRoot:"src/agent-ui"}));
 await symlink(path.join(repo,"packages/plugins"),path.join(root,"node_modules/@za38.03/agent-ui-plugins"),process.platform==="win32"?"junction":"dir");
 const customization=path.join(root,"src/agent-ui/plugins/custom.tsx");await writeFile(customization,"// preserved app customization\r\n");
 let calls=0;let fail=false;
 const publisher=await listen(createServer((_req,res)=>{calls++;if(fail){res.writeHead(503);res.end();return;}res.setHeader("Content-Type","application/json");res.end(JSON.stringify({schemaVersion:1,releases:[{id:"official-next",publishedAt:"2026-10-18T00:00:00Z",channel:"stable",packages:["core","renderer","runtime","plugins","creator"].map(id=>({name:`@za38.03/agent-ui-${id}`,version:"0.0.2",requires:{},historyFrom:"0.0.1",changes:id==="plugins"?[{id:"new-input",version:"0.0.2",summary:"New Composer input feature",kind:"feature",pluginId:"composer"}]:[]}))}]}));}));
 const config=path.join(root,"tool-config");await mkdir(config);await writeFile(path.join(config,".env.agentui.local"),`CREATOR_UPDATE_MANIFEST_URL=${publisher}/releases.json\n`);
 const handler=createCreatorUpdateHandler(undefined,root,undefined,{configRoot:config,environment:{}});
 const api=await listen(createServer((req,res)=>void handler(req,res)));
 const request=async(workspaceId=root)=>{const response=await fetch(`${api}/check`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({workspaceId,refresh:true})});return {status:response.status,body:await response.json()};};
 const first=await request();expect(first.status).toBe(200);expect(first.body.packageUpdates.status).toBe("online");expect(first.body.packageUpdates.packages.find((pkg:{name:string})=>pkg.name.endsWith("-plugins")).currentVersion).toBe("0.0.1");expect(first.body.packageUpdates.packages.find((pkg:{name:string})=>pkg.name.endsWith("-plugins")).targetVersion).toBe("0.0.2");expect(first.body.plugins).toEqual([]);expect(first.body.releaseVersion).toBe("0.0.1");
 expect(await readFile(customization,"utf8")).toBe("// preserved app customization\r\n");expect(await readdir(path.join(root,".agent-ui"))).toEqual(["project.json"]);
 fail=true;const cached=await request();expect(cached.body.packageUpdates.status).toBe("cached");expect(calls).toBe(2);expect((await request("different-project")).status).toBe(409);
 const pending=path.join(root,".agent-ui/source-project-transaction.json");const journal='{ "interrupted": true }';await writeFile(pending,journal);const blocked=await request();expect(blocked.status).toBe(409);expect(blocked.body.error).toBe("AGENT_UI_UPDATE_RECOVERY_REQUIRED");expect(await readFile(pending,"utf8")).toBe(journal);expect(await readFile(customization,"utf8")).toBe("// preserved app customization\r\n");
 const invoke=async(route:string,body:Record<string,unknown>)=>fetch(`${api}${route}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({workspaceId:root,...body})});
 expect((await invoke("/packages/execute",{planId:"invented",confirmed:false})).status).toBe(409);
 expect((await invoke("/packages/execute",{planId:"invented",confirmed:true})).status).toBe(409);
 await writeFile(path.join(root,".agent-ui-npm-update.json"),JSON.stringify({id:"recover-id",state:"recovery-required"}));
 const recovery=await request();expect(recovery.status).toBe(200);expect(recovery.body.packageUpdates.recovery).toEqual({id:"recover-id",state:"recovery-required"});expect(recovery.body.plugins).toEqual([]);
 expect((await invoke("/packages/recover",{planId:"recover-id",confirmed:false})).status).toBe(409);
 expect(await readFile(customization,"utf8")).toBe("// preserved app customization\r\n");
});
