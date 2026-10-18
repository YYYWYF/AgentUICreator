import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {syncPackageReleaseMetadata} from './sync-package-release-metadata.mjs';
test('build/prepack emits the same compatibility history in npm metadata and payload, and rejects stale publication',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'agent-ui release 中文 space-'));
 try{
  const directory=path.join(root,'packages','runtime');await mkdir(directory,{recursive:true});await mkdir(path.join(root,'releases'));
  const pkg={name:'@za38.03/agent-ui-runtime',version:'1.2.3',dependencies:{'@za38.03/agent-ui-core':'workspace:*'},exports:{'./compatibility.json':'./dist/compatibility.json'}};
  const manifest={schemaVersion:1,releases:[{id:'verified-combination',packages:[{name:pkg.name,version:pkg.version,requires:{'@za38.03/agent-ui-core':'1.0.4'}},{name:'@za38.03/agent-ui-core',version:'1.0.4',requires:{}}]}]};
  const file=path.join(directory,'package.json');await writeFile(file,JSON.stringify(pkg));await writeFile(path.join(root,'releases','compatibility.json'),JSON.stringify(manifest));
  await syncPackageReleaseMetadata('runtime',root);
  assert.deepEqual(JSON.parse(await readFile(file,'utf8')).agentUI,{schemaVersion:1,compatibility:manifest});
  assert.deepEqual(JSON.parse(await readFile(path.join(directory,'dist','compatibility.json'),'utf8')),manifest);
  pkg.dependencies['@za38.03/agent-ui-core']='^2.0.0';await writeFile(file,JSON.stringify(pkg));await assert.rejects(syncPackageReleaseMetadata('runtime',root),/Stale release requirements/);
  pkg.version='1.2.4';await writeFile(file,JSON.stringify(pkg));await assert.rejects(syncPackageReleaseMetadata('runtime',root),/Review compatibility metadata/);
  await assert.rejects(syncPackageReleaseMetadata('../outside',root),/Unknown public package/);
 }finally{await rm(root,{recursive:true,force:true});}
});
