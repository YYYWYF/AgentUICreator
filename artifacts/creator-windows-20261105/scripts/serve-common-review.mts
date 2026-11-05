import { cp, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnectionHostFixture } from './connection-host.mts';
import { hostEnvironment } from '../../../packages/creator/src/agent/config.ts';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const records = path.join(repository, 'artifacts/creator-common-questions-20261105');
const latest = JSON.parse(await readFile(path.join(records, 'latest.json'), 'utf8'));
const source = path.join(records, latest.directory);
const conversation = JSON.parse(await readFile(path.join(source, 'ui-conversation.json'), 'utf8'));
Object.assign(process.env, hostEnvironment(repository), {
  CREATOR_MODEL_NAME: 'deepseek-v4.1-flash', CREATOR_MODEL_MAX_TOKENS: '32768',
  CREATOR_CONTEXT_MAX_TOKENS: '262144', CREATOR_CONTEXT_KEEP_TOKENS: '12000',
  CREATOR_CONTEXT_SUMMARY_MAX_TOKENS: '8192', CREATOR_MODEL_TIMEOUT_SECONDS: '120',
  CREATOR_MODEL_TEMPERATURE: '0.2', CREATOR_MODEL_OPENCODE_SESSION_HEADER: '1',
  CREATOR_VERIFICATION_MODE: 'static_and_runtime', CREATOR_BEHAVIOR_VERIFICATION_ENABLED: '0',
  CREATOR_HOT_RELOAD: '0', AGENT_UI_TEST_SOURCE_CREATOR: '0', AGENT_UI_QA_FREEZE_PACKAGES: '1',
});
const packageRoots = Object.fromEntries(['core', 'renderer', 'runtime', 'plugins', 'web-component', 'creator'].map(name => ['@za38.03/agent-ui-' + name, path.join(repository, 'packages', name)]));
const fixture = await createConnectionHostFixture({ liveModel: true, packageRoots,
  prepareHost: root => cp(path.join(source, 'host/src/agent-ui'), path.join(root, 'src/agent-ui'), { recursive: true }),
});
const creatorRoot = path.resolve(fixture.hostRoot, '../creator');
const key = 'agent-ui-creator-conversation:' + fixture.workspaceId;
await writeFile(path.join(creatorRoot, 'review-state.js'), `if(sessionStorage.getItem(${JSON.stringify(key)})===null)sessionStorage.setItem(${JSON.stringify(key)},${JSON.stringify(JSON.stringify(conversation.value))});`);
const html = path.join(creatorRoot, 'index.html');
await writeFile(html, (await readFile(html, 'utf8')).replace('<div id="root">', '<script src="/review-state.js"></script><div id="root">'));
const { chromium } = createRequire(path.join(repository, 'apps/creator-workbench/package.json'))('@playwright/test');
const live: any = {creatorUrl:fixture.creatorOrigin, hostUrl:fixture.hostOrigin, hostRoot:fixture.hostRoot, pid:process.pid, source};
const liveFile=path.join(repository,'artifacts/creator-windows-20261105/local-runs/live-common-review.json');
await writeFile(liveFile,JSON.stringify(live,null,2));console.log(JSON.stringify(live));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const pageErrors:string[]=[];page.on('pageerror',error=>pageErrors.push(error.message));
try {
  await page.goto(fixture.creatorOrigin);
  await page.locator('#creator-request').waitFor({state:'visible'});
  await writeFile(path.join(source,'review-page-debug.json'),JSON.stringify(await page.evaluate(()=>({url:location.href,body:document.body.innerText,storage:Object.fromEntries(Object.keys(sessionStorage).map(k=>[k,sessionStorage.getItem(k)]))})),null,2));
  await page.locator('.creator-panel-messages').getByText('你能做什么', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('.creator-markdown').filter({ hasText: '我是 Agent UI' }).waitFor({ state: 'visible', timeout: 30000 });
  await page.screenshot({ path: path.join(source, 'live-review.png'), fullPage: true });
  live.verifiedInFreshBrowser=true;
} catch (error:any) { live.verificationError=error.message;live.pageErrors=pageErrors; }
finally { await browser.close(); }
Object.assign(live,{ creatorUrl: fixture.creatorOrigin, hostUrl: fixture.hostOrigin, pid: process.pid, source,
  question: '你能做什么', originalQuestionSeconds: latest.summary.secondsFromSubmitToComplete,
  restoredActualUIConversation: live.verifiedInFreshBrowser===true });
await writeFile(path.join(repository, 'artifacts/creator-windows-20261105/local-runs/live-common-review.json'), JSON.stringify(live, null, 2));
console.log(JSON.stringify(live));
await new Promise<void>(resolve => { process.once('SIGINT', () => resolve()); process.once('SIGTERM', () => resolve()); });
await fixture.close();
