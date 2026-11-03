import { expect, test } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { installOfficialAgentUIResource } from "@za38.03/agent-ui-creator/project/dev";
import { createConnectionHostFixture } from "./support/agent-connection-host.js";

for (const mode of ["platform", "assistant", "embedded"] as const) {
  test(`${mode} ungated Host localizes tool results and opens safe search links without losing its draft`, async ({ page, context }, testInfo) => {
    const preview = await createConnectionHostFixture({ mode, prepareHost: async root => {
      await installOfficialAgentUIResource(root, "web-search");
      await writeFile(path.join(root, "src/main.tsx"), `import {useState} from "react"; import {createRoot} from "react-dom/client"; import {Agent} from "./agent-ui"; import "./host.css";
        function Host(){const [locale,setLocale]=useState("zh-CN");return <><button style={{position:"fixed",left:0,top:0,zIndex:50}} onClick={()=>setLocale(value=>value==="zh-CN"?"en-US":"zh-CN")}>Switch locale</button><Agent locale={locale}/></>;} createRoot(document.getElementById("root")!).render(<Host/>);`);
    } });
    const errors: string[] = []; let requests = 0;
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error" && /same key|unique.*key/i.test(message.text())) errors.push(message.text()); });
    try {
      const model = await readFile(path.join(preview.hostRoot, "src/agent-ui/app-ui.json"), "utf8");
      expect(model).not.toContain('"pluginId": "auth-gate"');
      const sourceUrl = new URL("search-source", preview.hostOrigin).href;
      await context.route(sourceUrl, route => route.fulfill({ contentType: "text/html", body: "<h1>Search source opened</h1>" }));
      await page.route(`${preview.hostOrigin}agent`, async route => {
        requests++;
        const input = route.request().postDataJSON(); const identity = { threadId: input.threadId, runId: input.runId };
        const results = [
          { title: "First source", domain: "same.test", url: sourceUrl, snippet: "First source summary" },
          { title: "Second source", domain: "same.test", url: sourceUrl, snippet: "Second source summary" },
          { title: "Unsafe source", domain: "same.test", url: "javascript:alert(1)" },
          { title: "Legacy source", domain: "same.test" },
        ];
        const events = [
          { type: "RUN_STARTED", ...identity },
          { type: "TEXT_MESSAGE_START", messageId: "answer", role: "assistant" },
          { type: "TEXT_MESSAGE_CONTENT", messageId: "answer", delta: "Search completed." },
          { type: "TEXT_MESSAGE_END", messageId: "answer" },
          { type: "TOOL_CALL_START", toolCallId: "search", toolCallName: "web_search", parentMessageId: "answer" },
          { type: "TOOL_CALL_ARGS", toolCallId: "search", delta: JSON.stringify({ query: "Search query" }) },
          { type: "TOOL_CALL_END", toolCallId: "search" },
          { type: "TOOL_CALL_RESULT", toolCallId: "search", messageId: "result", role: "tool", content: JSON.stringify({ results }) },
          { type: "RUN_FINISHED", ...identity },
        ];
        await route.fulfill({ contentType: "text/event-stream", body: events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("") });
      });
      await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(preview.hostOrigin);
      if (mode === "assistant") await page.getByRole("button", { name: "打开助手", exact: true }).click();
      const input = page.locator(".aui-composer-root").getByRole("textbox"); await input.fill("Search"); await page.locator(".aui-composer-send").click();
      const search = page.locator('[data-slot="web-search"]'); await expect(search).toContainText("已读取 4 个来源");
      await expect(search).toContainText("First source summary"); await expect(search).toContainText("Second source summary");
      await expect(search.getByRole("link")).toHaveCount(2); await expect(search).toContainText("Unsafe source"); await expect(search).toContainText("Legacy source");
      const opened = context.waitForEvent("page"); await search.getByRole("link", { name: "First source", exact: true }).click(); const popup = await opened;
      await expect(popup.getByRole("heading", { name: "Search source opened" })).toBeVisible(); expect(await popup.evaluate(() => window.opener === null)).toBe(true); await popup.close();
      await input.fill("Keep this draft"); await page.getByRole("button", { name: "Switch locale", exact: true }).click();
      await expect(search).toContainText("Read 4 sources"); await expect(input).toHaveValue("Keep this draft");
      await page.getByRole("button", { name: "Switch locale", exact: true }).click(); await expect(search).toContainText("已读取 4 个来源");
      await expect(input).toHaveValue("Keep this draft"); expect(requests).toBe(1); expect(errors).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`${mode}-localized-search.png`), animations: "disabled" });
    } finally { await preview.close(); }
  });
}
