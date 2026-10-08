/** Reuses the workspace Playwright runtime; screenshots are evidence, not a pass assertion. */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.resolve(__dirname, '../../../../apps/creator-workbench/node_modules/@playwright/test'));
const output = process.env.CREATOR_ACCEPTANCE_OUTPUT;
if (!output) throw new Error('CREATOR_ACCEPTANCE_OUTPUT is required');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const observations = [];
  for (const [scenario, port] of [['A',5291],['B',5292]]) {
    const root = path.join(output, scenario);
    const baseline = JSON.parse(fs.readFileSync(path.join(root,'baseline-hashes.json'),'utf8'));
    const pluginRoot = path.join(root,'src/agent-ui/plugins');
    const newPlugins = fs.readdirSync(pluginRoot).filter(name => fs.existsSync(path.join(pluginRoot,name,'manifest.json')) &&
      !baseline[`src/agent-ui/plugins/${name}/manifest.json`]);
    for (const width of [1440,420]) for (const theme of ['light','dark']) {
      const page = await browser.newPage({viewport:{width,height:1000}});
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${port}/`);
      await page.locator('.acme-host').waitFor();
      if (theme === 'dark') await page.locator('.acme-host > .acme-card button, .acme-host > .ant-card button').first().click();
      await page.waitForTimeout(300);
      const evidence = await page.evaluate(() => {
        const host=document.querySelector('.acme-host');
        const controls=[...host.querySelectorAll('button,input')].slice(0,4).map(el=> {
          const c=getComputedStyle(el), r=el.getBoundingClientRect();
          return {tag:el.tagName,text:el.textContent,font:c.fontFamily,fontSize:c.fontSize,
            padding:c.padding,gap:c.gap,radius:c.borderRadius,color:c.color,background:c.backgroundColor,
            rect:{x:r.x,y:r.y,width:r.width,height:r.height}};
        });
        return {theme:host.dataset.theme,scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth,controls};
      });
      const screenshot=`${scenario}-${width}-${theme}.png`;
      await page.screenshot({path:path.join(output,screenshot),fullPage:true});
      observations.push({scenario,width,theme,screenshot,errors,newPlugins,evidence,
        pluginVisualStatus:newPlugins.length ? 'requires-review-and-interaction-checks' : 'not-executed-no-generated-plugin'});
      await page.close();
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(output,'visual-observations.json'),JSON.stringify(observations,null,2));
  console.log(JSON.stringify(observations.map(({scenario,width,theme,errors,newPlugins,pluginVisualStatus})=>({scenario,width,theme,errors,newPlugins,pluginVisualStatus}))));
})().catch(error => { console.error(error); process.exitCode=1; });
