import { mkdtemp, mkdir, readFile, writeFile, symlink, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
const repo = fileURLToPath(new URL('../../', import.meta.url));
const output = fileURLToPath(new URL('./results.json', import.meta.url));
const creator = JSON.parse(await readFile(path.join(repo, 'packages/creator/package.json'), 'utf8'));
const load = subpath => import(pathToFileURL(path.join(repo, 'packages/creator', creator.exports[subpath].import)));
const api = await load('./project/resources');
const commands = await load('./project/commands');
const mock = await load('./mock-agent');
const roots = [];
const summary = process.argv.includes('--resume') ? JSON.parse(await readFile(output,'utf8')) : { validation: 'macOS; real installed development APIs and disposable projects; reuse local installed dependencies; no fresh registry install, browser interaction, real model or Windows run', resources: [], enablePreparations: [], scenarios: mock.listOfficialMockScenarios().map(s => ({id:s.id, resources:s.resources})) };
summary.buildScope = 'Typecheck each resource; build source demos individually and all official Plugin application entries together. Earlier completed individual builds are retained.';
const errorInfo = e => ({ message:e.message, code:e.code, details:e.technicalDetails ?? e.details, stderr:e.stderr?.slice(-10000), stdout:e.stdout?.slice(-10000) });
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'resource check 中文 ')); roots.push(root);
  await run(process.execPath, [path.join(repo, 'packages/creator/operator/tests/support/prepare-host.mjs'), root, repo, 'assistant'], {maxBuffer:4e6});
  // Optional dependencies already installed in this checkout are declared and
  // linked in this disposable consumer. Package-manager execution is forbidden.
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  for (const name of ['react-hook-form', '@assistant-ui/react-hook-form', '@assistant-ui/generative-ui', '@za38.03/agent-ui-web-component']) {
    const source = path.join(repo, 'packages/creator/node_modules', name);
    const metadata = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
    manifest.dependencies[name] = metadata.version;
    const link = path.join(root, 'node_modules', name);
    if (!existsSync(link)) {await mkdir(path.dirname(link), {recursive:true}); await symlink(source, link, process.platform === 'win32' ? 'junction' : 'dir');}
  }
  for (const name of ['vite','@vitejs/plugin-react']) {
    const installed = JSON.parse(await readFile(path.join(root,'node_modules',name,'package.json'),'utf8')).version;
    for (const field of ['dependencies','devDependencies']) if(manifest[field]?.[name]) manifest[field][name] = installed;
  }
  await writeFile(path.join(root, 'package.json'), JSON.stringify(manifest, null, 2));
  return root;
}
const noPackages = async (_root, command) => {throw new Error('Unprepared package installation requested: ' + JSON.stringify(command));};
async function checks(root, includeBuild = false) {
  const result = {};
  for (const [key,args] of [['typecheck',['node_modules/typescript/bin/tsc','--noEmit']],['build',['build.mjs']]]) {
    if(key==='build' && !includeBuild)continue;
    try {await run(process.execPath,args,{cwd:root,maxBuffer:4e6}); result[key]='passed';}
    catch (e) {result[key]=errorInfo(e);}
  }
  return result;
}
try {
  const baseline = await fixture();
  const mockResources = new Set(summary.scenarios.flatMap(s => s.resources ?? []));
  summary.mockResourceIds = [...mockResources];
  for (const resource of api.officialResourceRegistry.resources) {
    if(summary.resources.some(entry=>entry.id===resource.id && entry.status==='passed'))continue;
    summary.resources=summary.resources.filter(entry=>entry.id!==resource.id);
    const root = await mkdtemp(path.join(tmpdir(), 'resource isolated 中文 ')); roots.push(root);
    await cp(baseline,root,{recursive:true,filter:source => source !== path.join(baseline,'node_modules')});
    await symlink(path.join(baseline,'node_modules'),path.join(root,'node_modules'),process.platform === 'win32' ? 'junction' : 'dir');
    const entry = {id:resource.id, mockRequired:mockResources.has(resource.id)};
    try {
      entry.before=(await api.inspectOfficialAgentUIResourceCatalog(root)).find(r=>r.id===resource.id)?.status;
      const result = await api.installOfficialAgentUIResource(root,resource.id,{runPackages:noPackages});
      entry.changed=result.changed;
      entry.after=(await api.inspectOfficialAgentUIResourceCatalog(root)).find(r=>r.id===resource.id)?.status;
      entry.installPostcondition='ready';
      entry.repeatChanged=(await api.installOfficialAgentUIResource(root,resource.id,{runPackages:noPackages})).changed;
      entry.checks=await checks(root, resource.implementation.type==='source-plugin');
      entry.status=Object.values(entry.checks).every(v=>v==='passed') ? 'passed' : 'failed';
    } catch(e) {entry.status='failed'; entry.error=errorInfo(e);}
    summary.resources.push(entry);
    console.log(JSON.stringify(entry));
    await writeFile(output,JSON.stringify(summary,null,2));
  }
  const enableRoot=await fixture();
  for (const pluginId of await commands.getAgentUIAvailablePluginIds(enableRoot)) {
    const entry={pluginId};
    try {
      const plan=await commands.preparePluginEnablement(enableRoot,pluginId);
      entry.plannedFiles=plan.files.length; entry.plannedPackages=plan.packages;
      await commands.completePluginEnablement(enableRoot,plan,noPackages);
      const after=await commands.preparePluginEnablement(enableRoot,pluginId);
      if(after.files.length || after.packages.length)throw new Error('Preparation incomplete');
      entry.status='passed';
    } catch(e) {entry.status='failed';entry.error=errorInfo(e);}
    summary.enablePreparations.push(entry); console.log(JSON.stringify(entry));
    await writeFile(output,JSON.stringify(summary,null,2));
  }
  summary.registry=await commands.synchronizeAgentUIPluginRegistry(enableRoot);
  summary.enableChecks=await checks(enableRoot,true);
} catch(e) {summary.fatal=errorInfo(e);console.log(JSON.stringify({fatal:summary.fatal}));}
finally {
  await writeFile(output,JSON.stringify(summary,null,2));
  for(const root of roots.reverse()) await rm(root,{recursive:true,force:true});
}
