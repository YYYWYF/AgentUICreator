import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { spawnPnpm, spawnPnpmSync } from "./pnpm-process.mjs";

const args = process.argv.slice(2);
const rootIndex = args.indexOf("--project-root");
const root = rootIndex < 0 ? fileURLToPath(new URL("..", import.meta.url)) : path.resolve(args[rootIndex + 1]);

// Exercise the installed native optimizer, not just Node filesystem mocks.
// This mode does not launch Creator, install packages, or modify project sources.
async function diagnoseDevelopmentCache() {
  const require = createRequire(path.join(root, "apps/creator-workbench/package.json"));
  const { resolveConfig, optimizeDeps } = await import(pathToFileURL(require.resolve("vite")).href);
  const esbuildRequire = createRequire(require.resolve("vite"));
  const esbuildPackage = esbuildRequire.resolve("esbuild/package.json");
  const report = {
    time: new Date().toISOString(),
    root,
    platform: process.platform,
    architecture: process.arch,
    node: process.version,
    esbuild: JSON.parse(await readFile(esbuildPackage, "utf8")).version,
    checks: [],
    permissions: [],
  };
  const permissionTargets = new Set([root]);
  if (process.platform === "win32") {
    const nativeRequire = createRequire(esbuildPackage);
    permissionTargets.add(nativeRequire.resolve(`@esbuild/win32-${process.arch}/esbuild.exe`));
  }
  const generations = new Set();
  const errorText = error => error instanceof Error ? error.message : String(error);
  for (let round = 1; round <= 3; round++) {
    for (const role of ["workbench", "host-preview"]) {
      const check = { round, role, cacheDir: null, nodeWrite: false, nativeWrite: false };
      report.checks.push(check);
      try {
        const config = await resolveConfig({
          root: path.join(root, role === "workbench" ? "apps/creator-workbench" : "examples/creator-host-sandbox"),
          configFile: path.join(root, "apps/creator-workbench", role === "workbench" ? "vite.config.ts" : "host-preview.vite.config.ts"),
          logLevel: "silent",
        }, "serve");
        // Diagnose the native executable's access separately from the Windows
        // host writer used by normal pnpm dev, so a recovered write cannot be
        // mistaken for evidence that esbuild itself can write this directory.
        for (const optimization of [config.optimizeDeps, config.environments.client?.optimizeDeps]) {
          const options = optimization?.esbuildOptions;
          if (options?.plugins) optimization.esbuildOptions = {
            ...options,
            plugins: options.plugins.filter(plugin => plugin.name !== "agent-ui-windows-development-output"),
          };
        }
        check.cacheDir = config.cacheDir;
        generations.add(path.resolve(config.cacheDir, "../.."));
        permissionTargets.add(config.cacheDir);
        const probe = path.join(config.cacheDir, "node-write-probe.js.map");
        const renamed = `${probe}.ready`;
        try {
          await writeFile(probe, "{}", { flag: "wx" });
          await rename(probe, renamed);
          check.nodeWrite = true;
        } finally {
          await rm(probe, { force: true });
          await rm(renamed, { force: true });
        }
        const result = await optimizeDeps(config, true);
        check.nativeWrite = Object.keys(result.optimized).length > 0;
        if (!check.nativeWrite) throw new Error("Native optimizer produced no dependencies");
      } catch (error) {
        check.error = errorText(error);
      }
      console.log(`[cache diagnosis] round ${round} ${role}: Node=${check.nodeWrite}, esbuild=${check.nativeWrite}${check.error ? `; ${check.error}` : ""}`);
    }
  }
  if (process.platform === "win32") {
    const execute = promisify(execFile);
    for (const target of permissionTargets) {
      try {
        const { stdout, stderr } = await execute("icacls.exe", [target], { windowsHide: true, timeout: 5000 });
        report.permissions.push({ target, stdout, stderr });
      } catch (error) {
        report.permissions.push({ target, error: errorText(error) });
      }
    }
  }
  for (const directory of generations) {
    // These exact generations were created above and their optimizers finished.
    try { await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
    catch (error) { report.checks.push({ cleanup: directory, error: errorText(error) }); }
  }
  const output = path.join(root, "node_modules/.cache", `agent-ui-cache-diagnosis-${Date.now()}.json`);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Cache diagnosis saved: ${output}`);
  return report.checks.every(check => check.nodeWrite && check.nativeWrite);
}

if (args.includes("--diagnose-cache")) {
  process.exitCode = await diagnoseDevelopmentCache() ? 0 : 1;
} else {
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
const environment = { ...process.env };
const startedAt = performance.now();
const timing = {};
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
    } catch { /* Dependency install, builds, and Agent startup may still be running. */ }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.equal(workspace?.status, "ready", "Creator did not select a ready workspace");
  timing.workspaceReadyMs = Math.round(performance.now() - startedAt);
  assert.equal(workspace.project?.mode, "platform", "Default dev target must be the platform template");
  const diagnostics = await fetch(`http://127.0.0.1:${dockPort}/__creator/runtime-diagnostics`, {
    method: "POST", body: "{}",
    headers: { "x-agent-ui-workspace-id": workspace.workspace.id, "Content-Type": "application/json" }, signal: AbortSignal.timeout(5000),
  });
  // An empty envelope must reach the authenticated Agent validator and return
  // its structured 400, rather than a Vite HTML fallback or an auth failure.
  assert.equal(diagnostics.status, 400, "Agent diagnostics validator is unavailable");
  assert(diagnostics.headers.get("content-type")?.includes("application/json"), "Agent proxy returned HTML instead of diagnostics");
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
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.locator("textarea,input,[contenteditable=true]").first().waitFor({ state: "visible", timeout: 90000 });
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
  timing.browserReadyMs = Math.round(performance.now() - startedAt);
} finally {
  stopping = true;
  await browser?.close();
  if (!exited) {
    if (process.platform === "win32") {
      await new Promise(resolve => execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], () => resolve()));
    } else child.kill("SIGTERM");
    await Promise.race([new Promise(resolve => child.once("close", resolve)), new Promise(resolve => setTimeout(resolve, 10000))]);
  }
}

console.log("Source-copy pnpm dev: Host, Creator Dock, workspace readiness, Agent proxy, and Chromium rendering passed.");
console.log(`DEV_STARTUP_TIMING ${JSON.stringify(timing)}`);
}
