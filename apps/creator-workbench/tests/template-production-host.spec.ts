import { expect, test } from "@playwright/test";
import { createServer, type ServerResponse } from "node:http";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createConnectionHostFixture } from "./support/agent-connection-host.js";
import { startRun, finishRun, writeEvent, type ControlledRunInput } from "./support/controlled-agent.js";

const evidenceRoot = process.env.AGENT_UI_TEMPLATE_EVIDENCE ? path.resolve(process.env.AGENT_UI_TEMPLATE_EVIDENCE) : fileURLToPath(new URL("../../../artifacts/template-production-20261101", import.meta.url));
const base = "/portal/agent-ui/";
const markdown = "## Production response\n\nPacked template **works**.\n\n```ts\nconst answer = 42;\n```\n\n- First\n- Second";

for (const mode of ["platform", "assistant", "embedded"] as const) test(`${mode}: packed production template works without Creator at a nested deployment path`, async ({ page }, testInfo) => {
  expect(process.env.AGENT_UI_TEST_CORE_CANDIDATE).toBeUndefined();
  const packages = JSON.parse(await readFile(process.env.AGENT_UI_TEMPLATE_PACKAGES ?? path.join(evidenceRoot, "packed/packages.json"), "utf8")) as { packageRoots: Record<string, string> };
  const output = path.join(evidenceRoot, "built", mode); await mkdir(output, { recursive: true });
  const inputs: ControlledRunInput[] = [], errors: string[] = [], assetFailures: string[] = [], developmentRequests: string[] = [], graph = new Set<string>();
  const failed = new Set<string>(), pending = new Set<ServerResponse>();
  let held: { input: ControlledRunInput; response: ServerResponse } | undefined, heldClosed = false;
  const contentTypes: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".json": "application/json" };
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url!, "http://fixture.test").pathname;
      if (pathname === "/agent" && request.method === "POST") {
        const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
        const input = JSON.parse(Buffer.concat(chunks).toString()) as ControlledRunInput; inputs.push(input);
        const text = String([...input.messages].reverse().find(message => message.role === "user")?.content);
        if (text === "Recover production" && !failed.has(text)) { failed.add(text); response.writeHead(503); response.end("Controlled temporary failure"); return; }
        startRun(response, input);
        if (text === "Hold production") {
          pending.add(response); response.once("close", () => { heldClosed = true; pending.delete(response); }); held = { input, response };
          writeEvent(response, { type: "TEXT_MESSAGE_START", messageId: "held-production", role: "assistant" });
          writeEvent(response, { type: "TEXT_MESSAGE_CONTENT", messageId: "held-production", delta: "Production stream remains active" }); return;
        }
        finishRun(response, input, text === "Recover production" ? "Recovered production request" : markdown); return;
      }
      if (!pathname.startsWith(base)) { response.writeHead(404); response.end(); return; }
      const relative = decodeURIComponent(pathname.slice(base.length)) || "index.html", file = path.resolve(output, relative);
      if (file !== output && !file.startsWith(output + path.sep)) { response.writeHead(403); response.end(); return; }
      const body = await readFile(file);
      response.setHeader("Content-Type", contentTypes[path.extname(file)] ?? "application/octet-stream");
      response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:");
      response.end(body);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  let fixture: Awaited<ReturnType<typeof createConnectionHostFixture>> | undefined;
  const began = Date.now();
  try {
    fixture = await createConnectionHostFixture({ mode, projectChecks: true, packageRoots: packages.packageRoots, pluginsPackageRoot: packages.packageRoots["@za38.03/agent-ui-plugins"]!, prepareHost: async root => {
      await writeFile(path.join(root, "index.html"), '<div id="root"></div><script type="module" src="/src/main.tsx"></script>');
      await writeFile(path.join(root, "src/host.css"), 'html,body{margin:0;width:100%;height:100%;}#root{height:100dvh;display:flex;flex-direction:column}.fixture-business{height:40px;flex:none;background:rgb(242,223,231)}.fixture-business input{color:rgb(193,21,85);border-radius:3px}.fixture-agent{flex:1;min-height:0;width:100%}');
      await writeFile(path.join(root, "src/main.tsx"), process.env.AGENT_UI_TEMPLATE_HOST_MODULE ? await readFile(process.env.AGENT_UI_TEMPLATE_HOST_MODULE, "utf8") : `import {createRoot} from "react-dom/client";import {Agent} from "./agent-ui";import "./host.css";const locale=new URLSearchParams(location.search).get("locale")==="en-US"?"en-US":"zh-CN";createRoot(document.getElementById("root")!).render(<><header className="fixture-business"><input aria-label="Host business input" defaultValue="Host content"/></header><section className="fixture-agent"><Agent endpoint="/agent" locale={locale}/></section></>);`);
      const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
      manifest.scripts = { typecheck: "node node_modules/typescript/bin/tsc --noEmit", build: "node production-build.mjs" };
      await writeFile(path.join(root, "package.json"), JSON.stringify(manifest, null, 2));
      await writeFile(path.join(root, "production-build.mjs"), `import {build} from "vite";import react from "@vitejs/plugin-react";import tailwind from "@tailwindcss/vite";import {writeFile} from "node:fs/promises";
const graph=new Set();await build({configFile:false,base:${JSON.stringify(base)},plugins:[react(),tailwind(),{name:"record-template-modules",generateBundle(_options,bundle){for(const value of Object.values(bundle))if(value.type==="chunk")for(const id of Object.keys(value.modules))graph.add(id.replaceAll(String.fromCharCode(92),"/"));}}],resolve:{dedupe:["react","react-dom"]},logLevel:"error"});await writeFile("production-graph.json",JSON.stringify([...graph]));`);
    } });
    const project = JSON.parse(await readFile(path.join(fixture.hostRoot, ".agent-ui/project.json"), "utf8"));
    expect(project.mode).toBeUndefined();
    const shells = await import("node:fs/promises").then(fs => fs.readdir(path.join(fixture!.hostRoot, "src/agent-ui/application/shell")));
    expect(shells.filter(file => file.endsWith(".tsx"))).toHaveLength(1);
    await promisify(execFile)(process.execPath, [path.join(fixture.hostRoot, "node_modules/typescript/bin/tsc"), "--noEmit"], { cwd: fixture.hostRoot, timeout: 60_000 });
    await promisify(execFile)(process.execPath, ["production-build.mjs"], { cwd: fixture.hostRoot, timeout: 60_000 });
    for (const id of JSON.parse(await readFile(path.join(fixture.hostRoot, "production-graph.json"), "utf8")) as string[]) graph.add(id);
    expect([...graph].filter(id => /agent-ui-creator|\/dist\/catalog\/|\/dist\/sources\//u.test(id))).toEqual([]);
    expect([...graph].some(id => id.includes(packages.packageRoots["@za38.03/agent-ui-runtime"]!.replaceAll("\\", "/") + "/"))).toBe(true);
    await cp(path.join(fixture.hostRoot, "dist"), output, { recursive: true });
    // Remove both development servers and the whole generated source project.
    // Only immutable static build output and the local AG-UI service survive.
    await fixture.close(); fixture = undefined;
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => { if (/__agent-ui|creator|@vite|@fs/u.test(request.url())) developmentRequests.push(request.url()); });
    page.on("response", response => { if (/\.(?:js|css|woff2|svg)(?:\?|$)/u.test(response.url()) && !response.ok()) assetFailures.push(`${response.status()} ${response.url()}`); });
    await page.goto(origin + base);
    const open = async (english = false) => { if (mode === "assistant") await page.getByRole("button", { name: english ? "Open assistant" : "打开助手", exact: true }).click(); };
    await open();
    const composer = page.locator('[data-ui-plugin="composer"]'), input = composer.getByRole("textbox");
    await expect(input).toBeEditable();
    await expect(page.getByRole("button", { name: /Creator Agent/ })).toHaveCount(0);
    expect(await page.getByRole("textbox", { name: "Host business input" }).evaluate(element => getComputedStyle(element).color)).toBe("rgb(193, 21, 85)");
    const send = async (text: string) => { await input.fill(text); await composer.locator(".aui-composer-send").click(); };
    await send("Production hello"); await expect(page.getByRole("heading", { name: "Production response", exact: true })).toBeVisible();
    await expect(page.locator(".aui-md pre")).toContainText("const answer = 42;");
    expect(await input.evaluate(element => parseFloat(getComputedStyle(element).paddingLeft))).toBeGreaterThan(0);
    await page.getByRole("button", { name: "更多操作", exact: true }).click();
    const downloading = page.waitForEvent("download"); await page.getByRole("menuitem", { name: "导出 Markdown", exact: true }).click();
    const download = await downloading, downloadPath = testInfo.outputPath(`${mode}-export.md`); await download.saveAs(downloadPath); expect(await readFile(downloadPath, "utf8")).toBe(markdown);
    await send("Recover production"); await expect.poll(() => failed.size).toBe(1);
    await expect(page.getByRole("button", { name: "重试", exact: true }).last()).toBeEnabled();
    await input.fill("Draft survives retry"); await page.getByRole("button", { name: "重试", exact: true }).last().click();
    await expect(page.locator(".aui-md").last()).toHaveText("Recovered production request"); await expect(input).toHaveValue("Draft survives retry");
    expect(inputs[1]!.threadId).toBe(inputs[2]!.threadId); expect(inputs[2]!.messages.filter(message => message.content === "Recover production")).toHaveLength(1);
    await send("Hold production"); await expect(page.locator(".aui-md").last()).toContainText("Production stream remains active"); await input.fill("Draft during production stream");
    if (mode === "assistant") {
      await page.getByRole("button", { name: "关闭助手", exact: true }).click(); await expect(input).toBeHidden(); expect(heldClosed).toBe(false);
      writeEvent(held!.response, { type: "TEXT_MESSAGE_CONTENT", messageId: "held-production", delta: " while hidden" });
      await open(); await expect(page.locator(".aui-md").last()).toContainText("while hidden"); await expect(input).toHaveValue("Draft during production stream");
    }
    await page.getByRole("button", { name: "停止生成", exact: true }).click(); await expect.poll(() => heldClosed).toBe(true); await expect(input).toHaveValue("Draft during production stream");
    await page.screenshot({ path: testInfo.outputPath(`${mode}-desktop.png`), fullPage: true, animations: "disabled" });
    if (mode === "embedded") {
      // A narrow producer inside a wide business page must use its container.
      await page.locator(".fixture-agent").evaluate(element => { const style = (element as HTMLElement).style; style.width = "360px"; style.height = "420px"; style.flex = "0 0 420px"; });
      await expect(input).toBeVisible(); const embedded = await input.boundingBox();
      expect(embedded!.x + embedded!.width).toBeLessThanOrEqual(361); expect(embedded!.y + embedded!.height).toBeLessThanOrEqual(461);
      await page.locator(".fixture-agent").evaluate(element => (element as HTMLElement).removeAttribute("style"));
    }
    await page.setViewportSize({ width: 390, height: 844 }); await expect(input).toBeVisible();
    await expect.poll(async () => (await input.boundingBox())?.width ?? 0).toBeGreaterThan(160);
    const box = await input.boundingBox(); expect(box).not.toBeNull(); expect(box!.width).toBeGreaterThan(160); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(391);
    await send("Mobile production"); await expect(page.getByRole("heading", { name: "Production response", exact: true }).last()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${mode}-mobile.png`), fullPage: true, animations: "disabled" });
    await input.fill("Old thread draft");
    const newConversation = page.getByRole("button", { name: "新建会话", exact: true });
    if (!await newConversation.isVisible()) await page.getByRole("button", { name: mode === "platform" ? "打开业务面板" : "历史会话", exact: true }).click();
    await newConversation.click();
    const historyDialog = page.getByRole("dialog", { name: "历史会话", exact: true });
    if (await historyDialog.isVisible()) await page.keyboard.press("Escape");
    if (await page.locator(".app-ui-layout-drawer[open]").isVisible()) await page.keyboard.press("Escape");
    await expect(input).toHaveValue(""); await expect(page.locator(".aui-md")).toHaveCount(0);
    const chooser = page.waitForEvent("filechooser"); await page.getByRole("button", { name: "添加附件", exact: true }).click();
    await (await chooser).setFiles({ name: "production-notes.txt", mimeType: "text/plain", buffer: Buffer.from("Production attachment body") });
    await expect(page.getByRole("group", { name: "文档附件 production-notes.txt", exact: true })).toBeVisible();
    await send("New production"); await expect(page.getByRole("heading", { name: "Production response", exact: true })).toBeVisible();
    const sentFile = JSON.stringify(inputs.at(-1)!.messages.at(-1)!.content);
    expect(sentFile).toContain("text/plain"); expect(sentFile).toContain(Buffer.from("Production attachment body").toString("base64")); expect(sentFile).toContain("production-notes.txt");
    expect(inputs.at(-1)!.threadId).not.toBe(inputs[0]!.threadId);
    await page.goto(origin + base + "?locale=en-US"); await open(true); await expect(input).toBeEditable(); await expect(composer.getByRole("button", { name: "Send message", exact: true })).toBeVisible();
    expect(developmentRequests).toEqual([]); expect(assetFailures).toEqual([]); expect(errors).toEqual([]); expect(inputs).toHaveLength(6);
  } finally {
    await writeFile(path.join(evidenceRoot, `${mode}-production.json`), JSON.stringify({ mode, elapsedMs: Date.now() - began, requests: inputs.map(input => ({ threadId: input.threadId, runId: input.runId })), graphModules: graph.size, errors, assetFailures, developmentRequests }, null, 2));
    await fixture?.close(); for (const response of pending) response.destroy(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
