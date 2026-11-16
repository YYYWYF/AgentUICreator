// @vitest-environment node
import {expect,it} from 'vitest';
import path from 'node:path';
import {NpmCompatibilityReleaseProvider} from '../src/updates/npm-release-provider';
import {officialPackageNames} from '../src/updates/compatibility-release';
import type {UpdateCommand} from '../src/updates/npm-artifact';
// Synthetic publisher evidence keeps discovery tests independent of unpublished release history.
const manifest={schemaVersion:1,releases:[{id:'test-release',publishedAt:'2026-10-18T00:00:00Z',channel:'stable',packages:officialPackageNames.map(name=>({name,version:'0.0.1',requires:{} as Record<string,string>,changes:[] as string[]}))}]};
function registry(){
 const calls:{root:string;args:string[]}[]=[];let offline=false;
 const metadata=new Map(officialPackageNames.map(name=>[name,{name,version:'0.0.1',agentUI:{schemaVersion:1,compatibility:structuredClone(manifest)}}]));
 const run:UpdateCommand=async(root,command,args)=>{calls.push({root,args});expect(command).toBe('npm');if(offline)throw new Error('private credential must never leak');const name=args[1]!.slice(0,args[1]!.lastIndexOf('@'));const pkg=metadata.get(name);if(!pkg)throw new Error('404');if(args[2]==='version'){if(args[1]!==`${name}@${pkg.version}`)throw new Error('404');return JSON.stringify(pkg.version);}return JSON.stringify(pkg);};
 return {run,calls,metadata,offline:()=>{offline=true;}};
}
it('queries npm latest using each project registry context, coalesces checks, and reuses a fresh cache',async()=>{
 const r=registry(),provider=new NpmCompatibilityReleaseProvider({run:r.run});
 const [a,b]=await Promise.all([provider.check(false,'/project with spaces'),provider.check(false,'/project with spaces')]);
 expect(a.status).toBe('online');expect(b).toEqual(a);expect(r.calls).toHaveLength(officialPackageNames.length);
 expect(r.calls.every(call=>call.root===path.resolve('/project with spaces')&&call.args[1]?.endsWith('@latest'))).toBe(true);
 await provider.check(false,'/project with spaces');expect(r.calls).toHaveLength(officialPackageNames.length);
 await provider.check(false,'/another-project');expect(r.calls).toHaveLength(officialPackageNames.length * 2);
});
it('still reports Creator latest when an unrelated package or source history is unavailable',async()=>{
 const r=registry();r.metadata.delete('@za38.03/agent-ui-web-component');
 for(const pkg of r.metadata.values())delete (pkg as any).agentUI;
 const result=await new NpmCompatibilityReleaseProvider({run:r.run}).check();
 expect(result.status).toBe('online');
 expect(result.issue).toBe('UPDATE_SOURCE_UNAVAILABLE');
 expect(result.latestPackages).toContainEqual({name:'@za38.03/agent-ui-creator',version:'0.0.1'});
 expect(result.manifest?.releases).toEqual([]);
});
it('does not advertise a prerelease Creator as the maintained stable release',async()=>{
 const r=registry();r.metadata.get('@za38.03/agent-ui-creator')!.version='1.0.0-beta.1';
 const result=await new NpmCompatibilityReleaseProvider({run:r.run}).check();
 expect(result.issue).toBe('UPDATE_SOURCE_UNAVAILABLE');
 expect(result.latestPackages?.some(pkg=>pkg.name==='@za38.03/agent-ui-creator')).toBe(false);
});
it('keeps the known Creator version explicitly cached when only its latest query fails',async()=>{
 let now=Date.parse('2026-11-15T00:00:00Z');
 const r=registry(),provider=new NpmCompatibilityReleaseProvider({run:r.run,now:()=>now});
 const initial=await provider.check();r.metadata.delete('@za38.03/agent-ui-creator');now+=60_000;
 const result=await provider.check(true);
 expect(result.status).toBe('cached');expect(result.fetchedAt).toBe(initial.fetchedAt);
 expect(result.checkedAt).not.toBe(initial.checkedAt);
 expect(result.latestPackages).toContainEqual({name:'@za38.03/agent-ui-creator',version:'0.0.1'});
 expect(result.issue).toBe('UPDATE_SOURCE_UNAVAILABLE');
 r.metadata.set('@za38.03/agent-ui-creator',{name:'@za38.03/agent-ui-creator',version:'0.0.2',agentUI:{schemaVersion:1,compatibility:structuredClone(manifest)}});
 const recovered=await provider.check(true);
 expect(recovered.status).toBe('online');expect(recovered.fetchedAt).toBe(recovered.checkedAt);
 expect(recovered.latestPackages).toContainEqual({name:'@za38.03/agent-ui-creator',version:'0.0.2'});
});
it('keeps the plan digest stable when independent npm requests finish in a different order',async()=>{
 const r=registry();let reverse=false;
 const run:UpdateCommand=async(root,command,args)=>{
  const index=officialPackageNames.findIndex(name=>args[1]===`${name}@latest`);
  await new Promise(resolve=>setTimeout(resolve,reverse?officialPackageNames.length-index:index));
  return r.run(root,command,args);
 };
 const provider=new NpmCompatibilityReleaseProvider({run});const first=await provider.check();reverse=true;
 expect((await provider.check(true)).digest).toBe(first.digest);
});
it('retains known history as cached on network failure without leaking command errors',async()=>{
 const r=registry(),provider=new NpmCompatibilityReleaseProvider({run:r.run});const initial=await provider.check();r.offline();const result=await provider.check(true);
 expect(result.status).toBe('cached');expect(result.fetchedAt).toBe(initial.fetchedAt);expect(result.manifest).toEqual(initial.manifest);expect(JSON.stringify(result)).not.toContain('credential');
 expect((await new NpmCompatibilityReleaseProvider({run:r.run}).check()).status).toBe('unavailable');
});
it('rejects conflicting metadata and immutable release rewrites',async()=>{
 const r=registry(),provider=new NpmCompatibilityReleaseProvider({run:r.run});expect((await provider.check()).status).toBe('online');
 r.metadata.values().next().value!.agentUI.compatibility.releases[0]!.publishedAt='2026-10-19T00:00:00Z';expect((await provider.check(true)).status).toBe('cached');
 for(const pkg of r.metadata.values())pkg.agentUI.compatibility.releases[0]!.publishedAt='2026-10-19T00:00:00Z';expect((await provider.check(true)).status).toBe('cached');
});
it('omits a partially published combination and keeps the installable release',async()=>{
 const r=registry();for(const pkg of r.metadata.values()){
 const next=structuredClone(manifest.releases[0]!);next.id='not-yet-published';for(const entry of next.packages){entry.version='0.0.2';for(const dependency of Object.keys(entry.requires))entry.requires[dependency]='0.0.2';}pkg.agentUI.compatibility.releases.push(next);
 }
 const result=await new NpmCompatibilityReleaseProvider({run:r.run}).check();expect(result.status).toBe('online');expect(result.manifest?.releases.map(release=>release.id)).toEqual([manifest.releases[0]!.id]);expect(r.calls.some(call=>call.args[2]==='version')).toBe(true);
});
it('keeps actual npm latest identities usable when recommendation history is absent',async()=>{
 const r=registry();for(const pkg of r.metadata.values())delete (pkg as any).agentUI;expect((await new NpmCompatibilityReleaseProvider({run:r.run}).check()).status).toBe('online');
 const wrong=registry();wrong.metadata.values().next().value!.version='0.0.9';expect((await new NpmCompatibilityReleaseProvider({run:wrong.run}).check()).latestPackages).toContainEqual({name:officialPackageNames[0],version:'0.0.9'});
});
