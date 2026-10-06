import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(path.join(root,'apps/creator-workbench/package.json'));
const { chromium } = require('@playwright/test');
const out = path.join(root,'docs/design/violet-theme/screenshots');
const base = process.env.VIOLET_INPUT_URL || 'http://127.0.0.1:5186';
fs.mkdirSync(out,{recursive:true});
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const failures = []; const records = [];
page.setDefaultTimeout(6000);
page.on('pageerror', e=>failures.push({url:page.url(),message:e.message}));
async function shot(name, locator, note) {
  await page.screenshot({path:path.join(out,`${name}-context.png`)});
  if (locator) await locator.screenshot({path:path.join(out,`${name}.png`)});
  else fs.copyFileSync(path.join(out,`${name}-context.png`),path.join(out,`${name}.png`));
  records.push({file:`${name}.png`,context:`${name}-context.png`,url:page.url(),viewport:page.viewportSize(),note,slots:await page.locator('[data-slot]').evaluateAll(es=>[...new Set(es.map(e=>e.getAttribute('data-slot')))])});
}
async function fixture(surface, theme='light', scenario='reasoning-tool-success') {
  await page.goto(`${base}/dev/violet-input/index.html?surface=${surface}&theme=${theme}&scenario=${scenario}`);
  await page.locator('[data-fixture-surface]').waitFor(); await page.waitForTimeout(650);
}
await page.goto(base); await page.locator('.agent-pane textarea:not([aria-hidden])').waitFor(); await page.waitForTimeout(700);
await shot('01-embedded-production-full',null,'Actual existing Host App and installed default composition. Atlas document pane is host-owned, outside Agent UI design scope.');
await shot('02-production-empty',page.locator('.agent-pane'),'Actual default embedded AppUIModel; no screenshot fixture.');
await page.locator('textarea:not([aria-hidden])').fill('Inspect theme tokens'); await page.getByRole('button',{name:'Send message',exact:true}).click(); await page.waitForTimeout(5500);
await shot('03-production-conversation',page.locator('.agent-pane'),'Actual default plugins, Mock reasoning-tool-success.');
for (const [surface,selector] of [
 ['plan-running','[data-slot="agent-plan"]'],['plan-completed','[data-slot="agent-plan"]'],
 ['status-working','[data-slot="agent-status"]'],['status-done','[data-slot="agent-status"]'],['status-waiting','[data-slot="agent-status"]'],
 ['job-running','[data-slot="job-progress"]'],['job-success','[data-slot="job-progress"]'],
 ['web-search','[data-slot="web-search"]'],['retrieval','[data-slot="retrieval-chunks"]'],
 ['tool-running',null],['tool-completed',null],['fallback-error',null],['reasoning',null],['question',null],['source',null],['file',null],
 ['dialog','[role="dialog"]'],['popover','[data-slot="popover-content"]'],['tooltip','[data-slot="tooltip-content"]'],
 ]) {
 await fixture(surface);
 if(surface === 'tooltip') {await page.getByRole('button',{name:'Help',exact:true}).hover();await page.waitForTimeout(350);}
 if(surface === 'reasoning') {await page.locator('[data-slot="reasoning-trigger"]').click();await page.waitForTimeout(300);}
 const target = selector ? page.locator(selector).first() : page.locator('[data-fixture-surface] > div');
 try {await shot(`component-${surface}`,target,'Real @agent-ui/react public component with fixed mock props, development fixture; not proof that this surface is installed in default composition.');}
 catch(e){failures.push({surface,message:e.message});}
}
for (const theme of ['light','dark','violet']) {
 await fixture('conversation',theme,'markdown-showcase');
 await shot(`04-composer-idle-${theme}`,page.locator('[data-slot="aui_composer-shell"]'),'Real canonical Composer in isolated ConversationRuntimeProvider.');
 await page.locator('textarea:not([aria-hidden])').fill('Show markdown'); await page.getByRole('button',{name:'Send',exact:true}).click(); await page.waitForTimeout(12000);
 await shot(`05-markdown-conversation-${theme}`,page.locator('[data-fixture-surface] > div'),'Actual ConversationThread driven by built-in AG-UI markdown-showcase. Scroll position as rendered, full viewport context retained.');
}
await fixture('conversation');
for(const [name,text] of [['mention','@'],['mention-empty','@none'],['mention-error','@error'],['slash','/']]) {
 await page.locator('textarea:not([aria-hidden])').fill(text);await page.waitForTimeout(700);
 await shot(`composer-${name}`,page.locator('[data-fixture-surface] > div'),'Real trigger components; fixture mention source deliberately supplies success, empty, and error.');
}
await fixture('conversation','light','data-message-chart');await page.locator('textarea:not([aria-hidden])').fill('Show chart');await page.getByRole('button',{name:'Send',exact:true}).click();await page.waitForTimeout(4500);
await shot('component-chart',page.locator('.agent-ui-chart-message'),'Actual registry chart-message implementation mounted via DataMessageUIRegistration and AG-UI mock scenario.');
await page.goto(`${base}/theme-showcase.html`);await page.waitForTimeout(1000);
await shot('showcase-thread-list',page.locator('.showcase-sidebar'),'Real ThreadList public surfaces with fixture thread binding. Showcase samples are not product Messages.');
await page.setViewportSize({width:390,height:844});await fixture('conversation');
await shot('06-conversation-narrow',null,'Real canonical thread/composer at narrow viewport; fixture outer padding 48px is not production layout.');
fs.writeFileSync(path.join(out,'capture-manifest.json'),JSON.stringify({capturedAt:new Date().toISOString(),base,records,failures},null,2));
console.log(JSON.stringify({records:records.length,failures},null,2));await browser.close();
