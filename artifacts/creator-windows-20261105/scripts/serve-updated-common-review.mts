import { readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createConnectionHostFixture } from './connection-host.mts';
import { hostEnvironment } from '../../../packages/creator/src/agent/config.ts';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const evidence = path.join(repository, 'artifacts/creator-removal-routing-20261105');
const previous = JSON.parse(await readFile(path.join(evidence, 'original-live-server.json'), 'utf8'));
Object.assign(process.env, hostEnvironment(repository), {
  CREATOR_MODEL_NAME:'deepseek-v4.1-flash', CREATOR_MODEL_MAX_TOKENS:'32768',
  CREATOR_CONTEXT_MAX_TOKENS:'262144', CREATOR_CONTEXT_KEEP_TOKENS:'12000',
  CREATOR_CONTEXT_SUMMARY_MAX_TOKENS:'8192', CREATOR_MODEL_TIMEOUT_SECONDS:'120',
  CREATOR_MODEL_TEMPERATURE:'0.2', CREATOR_MODEL_OPENCODE_SESSION_HEADER:'1',
  CREATOR_VERIFICATION_MODE:'static_and_runtime', CREATOR_BEHAVIOR_VERIFICATION_ENABLED:'0',
  CREATOR_HOT_RELOAD:'0', AGENT_UI_TEST_SOURCE_CREATOR:'0', AGENT_UI_QA_FREEZE_PACKAGES:'1',
});
const packageRoots = Object.fromEntries(['core','renderer','runtime','plugins','web-component','creator'].map(name=>['@za38.03/agent-ui-'+name,path.join(repository,'packages',name)]));
// Keep the existing target and its exact installed frontend packages. Only the
// development tool is replaced; browser session identity stays the same.
const fixture = await createConnectionHostFixture({ liveModel:true, packageRoots,
  existingHostRoot:previous.hostRoot, creatorPort:5173, hostPort:5174,
  packageSnapshotFile:path.join(evidence,'updated-package-snapshot.json'),
});
const html = path.join(fixture.creatorRoot,'index.html');
await writeFile(html,'<meta charset="utf-8">\n'+await readFile(html,'utf8'));
const installedCreator=await realpath(path.join(fixture.creatorRoot,'node_modules/@za38.03/agent-ui-creator'));
const live = { ...previous, creatorUrl:fixture.creatorOrigin,hostUrl:fixture.hostOrigin,pid:process.pid,
  originalServerPid:previous.pid,updatedAt:new Date().toISOString(),reusedTarget:true,
  reloadRequired:true, frozenCreatorAssetHashes:Object.fromEntries(await Promise.all([
    'runner.js','tools.js','execution-decision.js','plugin-target-names.js',
  ].map(async name=>[name,createHash('sha256').update(await readFile(path.join(installedCreator,'dist/agent',name))).digest('hex')]))),
};
await writeFile(path.join(repository,'artifacts/creator-windows-20261105/local-runs/live-common-review.json'),JSON.stringify(live,null,2));
await writeFile(path.join(evidence,'updated-live-server.json'),JSON.stringify(live,null,2));
console.log(JSON.stringify({creatorUrl:live.creatorUrl,hostUrl:live.hostUrl,reusedTarget:true,pid:live.pid}));
await new Promise<void>(resolve=>{process.once('SIGINT',()=>resolve());process.once('SIGTERM',()=>resolve());});
await fixture.close();
