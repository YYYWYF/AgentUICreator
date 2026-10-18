// @vitest-environment node
import {expect,it} from 'vitest';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {NpmCompatibilityReleaseProvider} from '../src/updates/npm-release-provider';
import {officialPackageNames} from '../src/updates/compatibility-release';
import type {UpdateCommand} from '../src/updates/npm-artifact';
const manifest=JSON.parse(await readFile(new URL('../../../releases/compatibility.json',import.meta.url),'utf8'));
function registry(){
 const calls:{root:string;args:string[]}[]=[];let offline=false;
 const metadata=new Map(officialPackageNames.map(name=>[name,{name,version:'0.0.1',agentUI:{schemaVersion:1,compatibility:structuredClone(manifest)}}]));
 const run:UpdateCommand=async(root,command,args)=>{calls.push({root,args});expect(command).toBe('npm');if(offline)throw new Error('private credential must never leak');const name=args[1]!.slice(0,args[1]!.lastIndexOf('@'));const pkg=metadata.get(name);if(!pkg)throw new Error('404');if(args[2]==='version'){if(args[1]!==`${name}@${pkg.version}`)throw new Error('404');return JSON.stringify(pkg.version);}return JSON.stringify(pkg);};
 return {run,calls,metadata,offline:()=>{offline=true;}};
}
it('queries npm latest using each project registry context, coalesces checks, and reuses a fresh cache',async()=>{
 const r=registry(),provider=new NpmCompatibilityReleaseProvider({run:r.run});
 const [a,b]=await Promise.all([provider.check(false,'/project with spaces'),provider.check(false,'/project with spaces')]);
 expect(a.status).toBe('online');expect(b).toEqual(a);expect(r.calls).toHaveLength(7);
 expect(r.calls.every(call=>call.root===path.resolve('/project with spaces')&&call.args[1]?.endsWith('@latest'))).toBe(true);
 await provider.check(false,'/project with spaces');expect(r.calls).toHaveLength(7);
 await provider.check(false,'/another-project');expect(r.calls).toHaveLength(14);
});
it('retains known history as cached on network failure without leaking command errors',async()=>{
 const r=registry(),provider=new NpmCompatibilityReleaseProvider({run:r.run});const initial=await provider.check();r.offline();const result=await provider.check(true);
 expect(result.status).toBe('cached');expect(result.fetchedAt).toBe(initial.fetchedAt);expect(result.manifest).toEqual(initial.manifest);expect(JSON.stringify(result)).not.toContain('credential');
 expect((await new NpmCompatibilityReleaseProvider({run:r.run}).check()).status).toBe('unavailable');
});
it('rejects conflicting metadata and immutable release rewrites',async()=>{
 const r=registry(),provider=new NpmCompatibilityReleaseProvider({run:r.run});expect((await provider.check()).status).toBe('online');
 r.metadata.values().next().value!.agentUI.compatibility.releases[0].publishedAt='2026-10-19T00:00:00Z';expect((await provider.check(true)).status).toBe('cached');
 for(const pkg of r.metadata.values())pkg.agentUI.compatibility.releases[0].publishedAt='2026-10-19T00:00:00Z';expect((await provider.check(true)).status).toBe('cached');
});
it('omits a partially published combination and keeps the installable release',async()=>{
 const r=registry();for(const pkg of r.metadata.values()){
 const next=structuredClone(manifest.releases[0]);next.id='not-yet-published';for(const entry of next.packages){entry.version='0.0.2';for(const dependency of Object.keys(entry.requires))entry.requires[dependency]='0.0.2';}pkg.agentUI.compatibility.releases.push(next);
 }
 const result=await new NpmCompatibilityReleaseProvider({run:r.run}).check();expect(result.status).toBe('online');expect(result.manifest?.releases.map(release=>release.id)).toEqual([manifest.releases[0].id]);expect(r.calls.some(call=>call.args[2]==='version')).toBe(true);
});
it('requires real package identity and publisher-owned compatibility metadata',async()=>{
 const r=registry();for(const pkg of r.metadata.values())delete (pkg as any).agentUI;expect((await new NpmCompatibilityReleaseProvider({run:r.run}).check()).status).toBe('unavailable');
 const wrong=registry();wrong.metadata.values().next().value!.version='0.0.9';expect((await new NpmCompatibilityReleaseProvider({run:wrong.run}).check()).status).toBe('unavailable');
});
