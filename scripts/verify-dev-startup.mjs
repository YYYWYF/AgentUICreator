import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnPnpm, spawnPnpmSync } from "./pnpm-process.mjs";

const args = process.argv.slice(2);
const rootIndex = args.indexOf("--project-root");
const root = rootIndex < 0 ? fileURLToPath(new URL("..", import.meta.url)) : path.resolve(args[rootIndex + 1]);
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}
const hostPort = await freePort();
let dockPort = await freePort();
while (dockPort === hostPort) dockPort = await freePort();
const cache = await mkdtemp(path.join(os.tmpdir(), "Agent UI startup Python "));
const environment = { ...process.env, CREATOR_PYTHON_ENV_ROOT: cache };
for (const name of ["CREATOR_PYTHON_EXECUTABLE", "CREATOR_PYTHON_ENDPOINT", "CREATOR_PYTHON_AUTH_TOKEN", "PYTHONPATH", "PYTHONHOME", "VIRTUAL_ENV"]) delete environment[name];
const child = spawnPnpm(["dev", "--host-port", String(hostPort), "--workbench-port", String(dockPort)], { cwd: root, env: environment, stdio: ["ignore", "pipe", "pipe"] });
let exited = false;
let failure;
let log = "";
let stopping = false;
const capture = chunk => { log = (log + chunk.toString()).slice(-64000); if (!stopping) process.stdout.write(chunk); };
child.stdout.on("data", capture);
child.stderr.on("data", capture);
child.once("error", error => { failure = error; exited = true; });
child.once("exit", () => { exited = true; });
let browser;
try {
  const deadline = Date.now() + 15 * 60_000;
  let workspace;
  while (Date.now() < deadline) {
    if (exited) throw failure ?? new Error(`pnpm dev exited before readiness:\n${log.slice(-8000)}`);
    try {
      const response = await fetch(`http://127.0.0.1:${dockPort}/__agent-ui/creator/workspace`, { signal: AbortSignal.timeout(2000) });
      const value = await response.json();
      if (response.ok && value.status === "ready") { workspace = value; break; }
    } catch { /* Dependency install, builds, and Python bootstrap may still be running. */ }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.equal(workspace?.status, "ready", "Creator did not select a ready workspace");
  assert.equal(workspace.project?.mode, "platform", "Default dev target must be the platform template");
  const diagnostics = await fetch(`http://127.0.0.1:${dockPort}/__creator/runtime-diagnostics`, {
    method: "POST", body: "{}",
    headers: { "x-agent-ui-workspace-id": workspace.workspace.id, "Content-Type": "application/json" }, signal: AbortSignal.timeout(5000),
  });
  // An empty envelope must reach the authenticated Python validator and return
  // its structured 400, rather than a Vite HTML fallback or an auth failure.
  assert.equal(diagnostics.status, 400, "Python sidecar diagnostics validator is unavailable");
  assert(diagnostics.headers.get("content-type")?.includes("application/json"), "Sidecar proxy returned HTML instead of diagnostics");
  assert.equal(typeof (await diagnostics.json()).error, "string");
  const host = `http://127.0.0.1:${hostPort}/`;
  const dock = `http://127.0.0.1:${dockPort}/dock.html`;
  assert.equal((await fetch(host)).status, 200);
  assert.equal((await fetch(dock)).status, 200);
  if (args.includes("--install-browser")) {
    const result = spawnPnpmSync(["--filter", "@za38.03/agent-ui-creator-workbench", "exec", "playwright", "install", "--with-deps", "chromium"], { cwd: root, stdio: "inherit" });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, "Chromium installation failed");
  }
  const require = createRequire(path.join(root, "apps/creator-workbench/package.json"));
  const { chromium } = require("@playwright/test");
  browser = await chromium.launch({ headless: true });
  for (const url of [host, dock]) {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
    assert((await page.locator("body").innerText()).trim().length > 0, "Page rendered no content");
    assert(await page.locator("textarea,input,[contenteditable=true]").count() > 0, "Page has no usable input");
    if (url === host) {
      await page.locator("#agent-ui-creator-dock button").waitFor();
      assert(await page.locator(".agent-ui-platform-shell").count() > 0, "Default Host must render the platform shell");
      assert.equal(await page.getByRole("button", { name: "zh-CN / en-US", exact: true }).count(), 0, "Style-isolation demo must remain a separate entry");
      await page.locator("#agent-ui-creator-dock button").click();
      await page.frameLocator("#agent-ui-creator-frame").locator("textarea,[contenteditable=true]").first().waitFor();
    }
    assert.deepEqual(errors, [], `Browser runtime failed for ${url}`);
    await page.close();
  }
} finally {
  stopping = true;
  await browser?.close();
  if (!exited) {
    if (process.platform === "win32") {
      await new Promise(resolve => execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], () => resolve()));
    } else child.kill("SIGTERM");
    await Promise.race([new Promise(resolve => child.once("close", resolve)), new Promise(resolve => setTimeout(resolve, 10000))]);
  }
  await rm(cache, { recursive: true, force: true });
}

console.log("Source-copy pnpm dev: Host, Creator Dock, workspace readiness, Python proxy, and Chromium rendering passed.");
