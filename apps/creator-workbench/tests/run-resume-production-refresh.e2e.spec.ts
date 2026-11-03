import { expect, test } from "@playwright/test";
import { createServer, type ServerResponse } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { build, preview as serveProduction } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { createConnectionHostFixture } from "./support/agent-connection-host.js";

test("formal generated binding reopens its initial thread and resumes after production refresh", async ({ page }) => {
  const threadId = "production-durable-thread";
  let runs = 0, resumes = 0, historyLoads = 0;
  const pending = new Set<ServerResponse>();
  const requests: string[] = [];
  const backend = createServer(async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (request.method === "OPTIONS") { response.writeHead(204).end(); return; }
    const route = new URL(request.url!, "http://backend.test").pathname;
    const json = (value: unknown) => { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(value)); };
    if (route === "/conversations") { json({ conversations: [{ id: threadId, title: "Durable task" }] }); return; }
    if (route === `/conversation/${threadId}`) {
      historyLoads++;
      json({ id: threadId, title: "Durable task", state: { values: { messages: runs ? [
        { id: "user-1", type: "human", content: "Complete durable task" },
        { id: "assistant-1", type: "ai", content: "正在分析第一部分……" },
      ] : [] } } }); return;
    }
    if (route === "/status") { json({ running: runs > 0 && resumes === 0 }); return; }
    if (route === "/resume") {
      resumes++;
      response.setHeader("Content-Type", "application/x-ndjson");
      response.write(JSON.stringify({ content: [{ type: "text", text: "第二部分完成……" }], status: { type: "running" } }) + "\n");
      setTimeout(() => response.end(JSON.stringify({ content: [{ type: "text", text: "第二部分完成……任务完成" }], status: { type: "complete", reason: "stop" } }) + "\n"), 300);
      return;
    }
    if (route === "/agent" && request.method === "POST") {
      let body = ""; for await (const chunk of request) body += chunk;
      const input = JSON.parse(body); requests.push(input.threadId); runs++;
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      for (const event of [
        { type: "RUN_STARTED", threadId: input.threadId, runId: input.runId },
        { type: "TEXT_MESSAGE_START", messageId: "assistant-1", role: "assistant" },
        { type: "TEXT_MESSAGE_CONTENT", messageId: "assistant-1", delta: "正在分析第一部分……" },
      ]) response.write(`data: ${JSON.stringify(event)}\n\n`);
      // A browser disconnect leaves the durable server run available to resume.
      pending.add(response); response.once("close", () => pending.delete(response)); return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>(resolve => backend.listen(0, "127.0.0.1", resolve));
  const address = backend.address(); if (!address || typeof address === "string") throw new Error("Backend unavailable");
  const endpoint = `http://127.0.0.1:${address.port}`;
  const fixture = await createConnectionHostFixture({ prepareHost: async root => {
    await writeFile(path.join(root, "index.html"), '<div id="root"></div><script type="module" src="/src/main.tsx"></script>');
    await writeFile(path.join(root, "src/main.tsx"), `
      import { createRoot } from "react-dom/client";
      import { Agent } from "./agent-ui";
      import { createHttpConversationDataSource } from "./agent-ui/services/conversations";
      import "./host.css";
      const endpoint = ${JSON.stringify(endpoint)};
      const history = createHttpConversationDataSource({ endpoint });
      async function runResumeProvider() {
        const status = await (await fetch(endpoint + "/status")).json();
        if (!status.running) return;
        return { async *stream(signal) {
          const response = await fetch(endpoint + "/resume", { signal });
          if (!response.ok || !response.body) throw new Error("Resume unavailable");
          const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
          let buffer = "";
          try { while (true) {
            const { value, done } = await reader.read(); if (done) break;
            buffer += value; let newline;
            while ((newline = buffer.indexOf("\\n")) >= 0) {
              const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
              if (line) yield JSON.parse(line);
            }
          } } finally { reader.releaseLock(); }
        } };
      }
      createRoot(document.getElementById("root")).render(<Agent conversationDataSource={history} endpoint={endpoint + "/agent"} initialThreadId=${JSON.stringify(threadId)} runResumeProvider={runResumeProvider} />);
    `);
  } });
  let production: Awaited<ReturnType<typeof serveProduction>> | undefined;
  try {
    await build({ configFile: false, root: fixture.hostRoot, plugins: [react(), tailwind()], resolve: { dedupe: ["react", "react-dom"] }, logLevel: "error" });
    production = await serveProduction({ configFile: false, root: fixture.hostRoot, preview: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    const productionUrl = production.resolvedUrls?.local[0];
    if (!productionUrl) throw new Error("Production preview unavailable");
    await page.goto(productionUrl);
    await page.locator(".aui-composer-root").getByRole("textbox").fill("Complete durable task");
    await page.locator(".aui-composer-send").click();
    await expect(page.getByText("正在分析第一部分……", { exact: true })).toBeVisible();
    expect(runs).toBe(1);
    await page.reload();
    await expect(page.locator(".aui-thread-root")).toContainText("正在分析第一部分……第二部分完成……任务完成", { timeout: 20_000 });
    await expect(page.locator('[data-role="user"]')).toHaveCount(1);
    const rendered = await page.locator(".aui-thread-root").innerText();
    expect(rendered.split("正在分析第一部分……")).toHaveLength(2);
    expect(requests).toEqual([threadId]); expect(runs).toBe(1); expect(resumes).toBe(1); expect(historyLoads).toBeGreaterThanOrEqual(2);
    expect(errors).toEqual([]);
  } finally {
    await new Promise<void>(resolve => production ? production.httpServer.close(() => resolve()) : resolve());
    await fixture.close();
    for (const response of pending) response.destroy();
    backend.closeAllConnections(); await new Promise<void>(resolve => backend.close(() => resolve()));
  }
});
