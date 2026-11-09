import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {syncPackageReleaseMetadata} from './sync-package-release-metadata.mjs';
import {publicTypeEntries} from './public-package-types.mjs';
test('packed declaration patterns use logical paths for Windows filenames',()=>{
 const files=['dist/ui/index.d.ts','dist/ui/runtime/界面/panel.d.ts','dist/ui/index.d.ts.map','dist/ui/index.js'];
 const expected=['./ui/index','./ui/runtime/界面/panel'];
 assert.deepEqual(publicTypeEntries('./ui/*','./dist/ui/*.d.ts',files),expected);
 assert.deepEqual(publicTypeEntries('./ui/*','./dist/ui/*.d.ts',files.map(file=>path.win32.join(...file.split('/')))),expected);
});
test('build/prepack keeps root and legacy subpath types aligned with exports',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'agent-ui types 中文 space-'));
 try{
  const directory=path.join(root,'packages','runtime');await mkdir(directory,{recursive:true});await mkdir(path.join(root,'releases'));
  const file=path.join(directory,'package.json');
  const pkg={name:'@za38.03/agent-ui-runtime',version:'0.0.1',exports:{
   '.':{types:'./dist/index.d.ts',import:'./dist/index.js'},
   './ui':{types:'./dist/ui/index.d.ts',import:'./dist/ui/index.js'},
   './ui/*':{types:'./dist/ui/*.d.ts',import:'./dist/ui/*.js'},
   './ui/styles.css':'./dist/ui/styles.css',
  }};
  await writeFile(file,JSON.stringify(pkg));await writeFile(path.join(root,'releases','compatibility.json'),JSON.stringify({schemaVersion:1,releases:[]}));
  await syncPackageReleaseMetadata('runtime',root);
  const generated=JSON.parse(await readFile(file,'utf8'));
  assert.equal(generated.types,'./dist/index.d.ts');
  assert.deepEqual(generated.typesVersions,{'*':{'ui':['./dist/ui/index.d.ts'],'ui/*':['./dist/ui/*.d.ts']}});
  await syncPackageReleaseMetadata('runtime',root,{checkOnly:true});
  generated.types='./missing.d.ts';await writeFile(file,JSON.stringify(generated));
  await assert.rejects(syncPackageReleaseMetadata('runtime',root,{checkOnly:true}),/Stale package type metadata/);
  delete pkg.exports['./ui/*'];await writeFile(file,JSON.stringify(pkg));
  await syncPackageReleaseMetadata('runtime',root);
  assert.deepEqual(JSON.parse(await readFile(file,'utf8')).typesVersions,{'*':{'ui':['./dist/ui/index.d.ts']}});
 }finally{await rm(root,{recursive:true,force:true});}
});
test('build/prepack emits compatibility history while explicit checks reject stale release requirements',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'agent-ui release 中文 space-'));
 try{
  const directory=path.join(root,'packages','runtime');await mkdir(directory,{recursive:true});await mkdir(path.join(root,'releases'));
  const pkg={name:'@za38.03/agent-ui-runtime',version:'1.2.3',dependencies:{'@za38.03/agent-ui-core':'workspace:*'},exports:{'./compatibility.json':'./dist/compatibility.json'}};
  const manifest={schemaVersion:1,releases:[{id:'verified-combination',packages:[{name:pkg.name,version:pkg.version,requires:{'@za38.03/agent-ui-core':'1.0.4'}},{name:'@za38.03/agent-ui-core',version:'1.0.4',requires:{}}]}]};
  const file=path.join(directory,'package.json');await writeFile(file,JSON.stringify(pkg));await writeFile(path.join(root,'releases','compatibility.json'),JSON.stringify(manifest));
  await syncPackageReleaseMetadata('runtime',root);
  assert.deepEqual(JSON.parse(await readFile(file,'utf8')).agentUI,{schemaVersion:1,compatibility:manifest});
  assert.deepEqual(JSON.parse(await readFile(path.join(directory,'dist','compatibility.json'),'utf8')),manifest);
  await syncPackageReleaseMetadata('runtime',root,{checkOnly:true});
  pkg.dependencies['@za38.03/agent-ui-core']='^2.0.0';await writeFile(file,JSON.stringify(pkg));
  await syncPackageReleaseMetadata('runtime',root);
  await assert.rejects(syncPackageReleaseMetadata('runtime',root,{checkOnly:true}),/Stale release requirements/);
  await assert.rejects(syncPackageReleaseMetadata('runtime',root,{publishing:true}),/Stale release requirements/);
  pkg.version='1.2.4';await writeFile(file,JSON.stringify(pkg));
  await syncPackageReleaseMetadata('runtime',root);
  await assert.rejects(syncPackageReleaseMetadata('runtime',root,{checkOnly:true}),/Review compatibility metadata/);
  await assert.rejects(syncPackageReleaseMetadata('../outside',root),/Unknown public package/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('unpublished development emits empty history while publication still requires review',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'agent-ui unpublished 中文 space-'));
 try{
  const directory=path.join(root,'packages','core');await mkdir(directory,{recursive:true});await mkdir(path.join(root,'releases'));
  const file=path.join(directory,'package.json');
  await writeFile(file,JSON.stringify({name:'@za38.03/agent-ui-core',version:'0.0.1',agentUI:{schemaVersion:1,compatibility:{schemaVersion:1,releases:[{id:'stale'}]}}}));
  const manifest={schemaVersion:1,releases:[]};await writeFile(path.join(root,'releases','compatibility.json'),JSON.stringify(manifest));
  await syncPackageReleaseMetadata('core',root);
  assert.deepEqual(JSON.parse(await readFile(file,'utf8')).agentUI.compatibility,manifest);
  assert.deepEqual(JSON.parse(await readFile(path.join(directory,'dist','compatibility.json'),'utf8')),manifest);
  await assert.rejects(syncPackageReleaseMetadata('core',root,{publishing:true}),/Review compatibility metadata/);
 }finally{await rm(root,{recursive:true,force:true});}
});
