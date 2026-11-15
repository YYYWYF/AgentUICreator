import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnPnpm } from "./pnpm-process.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const pluginRequire = createRequire(path.join(root, "packages/plugins/package.json"));
// Browser-test tooling belongs to the workspace's existing test Host.
const { chromium, expect } = createRequire(path.join(root, "apps/creator-workbench/package.json"))("@playwright/test");
const { build } = pluginRequire("esbuild");
const { compile } = pluginRequire("@tailwindcss/node");
const { Scanner } = pluginRequire("@tailwindcss/oxide");
const pluginManifest = JSON.parse(await readFile(path.join(root, "packages/plugins/package.json"), "utf8"));
const versions = ["18.2.0", pluginManifest.devDependencies.react];
const evidenceRoot = path.join(root, "artifacts/react-menu-compat");

async function installHost(directory, version) {
  await writeFile(path.join(directory, "package.json"), JSON.stringify({
    private: true, dependencies: { react: version, "react-dom": version },
  }));
  await writeFile(path.join(directory, "pnpm-workspace.yaml"), "packages: []\n");
  const child = spawnPnpm(["install", "--ignore-scripts", "--no-frozen-lockfile", "--prefer-offline",
    "--fetch-retries=1", "--fetch-timeout=45000", "--config.enableGlobalVirtualStore=false"],
  { cwd: directory, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", data => { output += data; });
  child.stderr.on("data", data => { output += data; });
  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
  assert.equal(code, 0, `React ${version} fixture install failed:\n${output}`);
}

const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/fixture.css">
<style>
body { margin: 0; padding: 24px 16px; background: Canvas; color: CanvasText; }
#root { width: min(320px, calc(100vw - 32px)); }
[data-surface=floating] #root { position: fixed; right: 16px; bottom: 24px; height: 480px; border: 1px solid GrayText; border-radius: 12px; }
.ref-controls { display: grid; gap: 8px; padding: 12px; }
</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`;

async function checkRefs(page) {
  await expect.poll(() => page.evaluate(() => {
    const f = window.reactMenuFixture;
    return Object.entries(f.refs).every(([name, ref]) => ref.current !== null && ref.current === document.querySelector(`[data-ref="${name}"]`)) &&
      Object.entries(f.refs).every(([name]) => f.callbacks[name] === document.querySelector(`[data-ref="callback-${name}"]`));
  })).toBe(true);
  expect(await page.evaluate(() => {
    const { refs, callbacks } = window.reactMenuFixture;
    return [refs.button.current instanceof HTMLButtonElement, refs.input.current instanceof HTMLInputElement,
      refs.newThread.current instanceof HTMLButtonElement, callbacks.button instanceof HTMLButtonElement,
      callbacks.input instanceof HTMLInputElement, callbacks.newThread instanceof HTMLButtonElement];
  })).toEqual([true, true, true, true, true, true]);
  // Exercise the public imperative DOM contract, not just ref identity.
  expect(await page.evaluate(() => {
    const { input } = window.reactMenuFixture.refs;
    input.current.focus(); input.current.select();
    return [document.activeElement === input.current, input.current.selectionStart, input.current.selectionEnd];
  })).toEqual([true, 0, "Select this text".length]);
  await page.evaluate(() => window.reactMenuFixture.unmountControls());
  await expect(page.locator(".ref-controls")).toHaveCount(0);
  expect(await page.evaluate(() => {
    const f = window.reactMenuFixture;
    return Object.values(f.refs).every(ref => ref.current === null) &&
      Object.keys(f.refs).every(name => f.callbacks[name] === null && f.callbackDetached[name]);
  })).toBe(true);
}

async function openMenu(page, row) {
  await row.hover();
  await row.getByRole("button", { name: "More options", exact: true }).click();
  const menu = page.locator('[data-slot="agent-ui-thread-action-menu"]');
  await expect(menu).toBeVisible();
  await expect(menu).toBeInViewport();
  await expect.poll(() => menu.evaluate(element => Number(getComputedStyle(element).opacity))).toBe(1);
  // DOM existence and even Playwright visibility alone miss the offscreen
  // pre-positioning transform. Require actual placement beside the anchor.
  await expect.poll(async () => {
    const trigger = await row.getByRole("button", { name: "More options", exact: true }).boundingBox();
    const bounds = await menu.boundingBox();
    const viewport = page.viewportSize();
    if (!trigger || !bounds || bounds.width <= 0 || bounds.height <= 0) return false;
    const gap = Math.min(Math.abs(bounds.x - trigger.x - trigger.width), Math.abs(trigger.x - bounds.x - bounds.width));
    return bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width &&
      bounds.y + bounds.height <= viewport.height && gap <= 12 &&
      bounds.y <= trigger.y + trigger.height && bounds.y + bounds.height >= trigger.y;
  }).toBe(true);
  expect(await menu.evaluate(element => {
    const wrapper = element.closest("[data-radix-popper-content-wrapper]");
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return wrapper?.style.transform !== "translate(0, -200%)" && element.contains(hit);
  })).toBe(true);
  return menu;
}

async function checkMenu(page, label) {
  const row = title => page.locator('[data-slot="aui_thread-list-item"]').filter({ hasText: title });
  const first = row("First history");
  await expect(first).toBeVisible();
  let menu = await openMenu(page, first);
  await page.screenshot({ path: path.join(evidenceRoot, `${label}.png`) });
  await menu.getByRole("menuitem", { name: "Rename", exact: true }).click();
  const editor = page.locator('[data-slot="agent-ui-thread-rename-input"]');
  await expect(editor).toBeFocused();
  expect(await editor.evaluate(input => [input.selectionStart, input.selectionEnd])).toEqual([0, "First history".length]);
  await editor.fill("Canceled title");
  await editor.press("Escape");
  await expect(first.getByRole("button", { name: "First history", exact: true })).toBeFocused();
  menu = await openMenu(page, first);
  await menu.getByRole("menuitem", { name: "Rename", exact: true }).click();
  await editor.fill("Renamed history");
  await editor.press("Enter");
  const renamed = row("Renamed history");
  await expect(renamed.getByRole("button", { name: "Renamed history", exact: true })).toBeFocused();
  menu = await openMenu(page, renamed);
  await menu.getByRole("menuitem", { name: "Archive", exact: true }).click();
  const archived = page.locator('[data-slot="agent-ui-archived-threads"]');
  await expect(renamed).toBeHidden();
  await archived.locator("summary").click();
  await expect(archived).toContainText("Renamed history");
  menu = await openMenu(page, renamed);
  await menu.getByRole("menuitem", { name: "Unarchive", exact: true }).click();
  await expect(archived.locator('[data-slot="aui_thread-list-item"]')).toHaveCount(0);
  await expect(renamed).toBeVisible();
  menu = await openMenu(page, renamed);
  await menu.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(renamed).toHaveCount(0);
  await expect(row("Second history")).toBeVisible();
}

export async function checkReactMenuCompatibility() {
  await mkdir(evidenceRoot, { recursive: true });
  const styleRoot = path.join(root, "packages/plugins/dist");
  const browser = await chromium.launch({ headless: true });
  const cases = [];
  try {
    for (const version of versions) {
      // A space and Unicode in the real Windows path also exercise URL/path resolution.
      const directory = await mkdtemp(path.join(os.tmpdir(), "agent-ui React 菜单-"));
      let server;
      try {
        await installHost(directory, version);
        const hostRequire = createRequire(path.join(directory, "package.json"));
        const styleInputs = new Set();
        await build({
          entryPoints: [path.join(root, "packages/plugins/tests/fixtures/react-menu-compat.tsx")],
          outfile: path.join(directory, "fixture.js"), bundle: true, platform: "browser", format: "iife",
          jsx: "automatic", sourcemap: true, define: { "process.env.NODE_ENV": '"development"' },
          plugins: [{ name: "isolated-host-react", setup(builder) {
            builder.onResolve({ filter: /^(react|react-dom)(\/.*)?$/ }, args => ({ path: hostRequire.resolve(args.path) }));
            builder.onLoad({ filter: /\.css$/ }, args => {
              styleInputs.add(args.path);
              return { contents: "", loader: "empty" };
            });
          } }],
        });
        const styleEntry = [...styleInputs].sort((a, b) => Number(b === path.join(styleRoot, "styles.css")) - Number(a === path.join(styleRoot, "styles.css")) || a.localeCompare(b))
          .map(file => `@import ${JSON.stringify("./" + path.relative(styleRoot, file).split(path.sep).join("/"))};`).join("\n");
        const compiler = await compile(styleEntry, { base: styleRoot, onDependency() {} });
        const sources = [...compiler.sources, ...(compiler.root && compiler.root !== "none" ? [compiler.root] : [])]
          .map(source => ({ ...source, negated: source.negated ?? false }));
        const css = compiler.build(new Scanner({ sources }).scan());
        const files = new Map([["fixture.js", await readFile(path.join(directory, "fixture.js"))], ["fixture.css", css]]);
        server = createServer((request, response) => {
          const name = new URL(request.url, "http://fixture.test").pathname.slice(1);
          response.setHeader("Content-Type", name.endsWith(".js") ? "text/javascript" : name.endsWith(".css") ? "text/css" : "text/html");
          response.end(files.get(name) ?? html);
        });
        await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
        for (const delivery of ["npm", "source"]) for (const theme of ["light", "dark"]) for (const surface of ["panel", "narrow", "floating"]) {
          const label = `${version}-${delivery}-${theme}-${surface}`;
          const page = await browser.newPage({ viewport: { width: surface === "narrow" ? 360 : 1000, height: 760 } });
          const errors = [];
          page.on("pageerror", error => errors.push(error.message));
          page.on("console", message => { if (message.type() === "error" || /cannot be given refs|ref.*(?:prop|forwardRef)/iu.test(message.text())) errors.push(message.text()); });
          try {
            await page.goto(`http://127.0.0.1:${server.address().port}/?${new URLSearchParams({ delivery, theme, surface })}`);
            await expect.poll(() => page.evaluate(() => window.reactMenuFixture?.reactVersion)).toBe(version);
            await expect(page.locator('[data-ui-plugin="conversation-thread-list"]')).toHaveAttribute("data-color-scheme", theme);
            await checkRefs(page);
            await checkMenu(page, label);
            expect(errors, label).toEqual([]);
            cases.push({ label, passed: true });
            await rm(path.join(evidenceRoot, `${label}-failed.png`), { force: true });
            console.log(`React ${label}: DOM refs/cleanup, visible positioned menu, rename/focus/archive/unarchive/delete OK`);
          } catch (error) {
            cases.push({ label, passed: false, error: error.message, browserErrors: errors });
            await page.screenshot({ path: path.join(evidenceRoot, `${label}-failed.png`) });
            throw new Error(`${label}: ${error.message}\nBrowser errors: ${errors.join("\n")}`, { cause: error });
          } finally { await page.close(); }
        }
      } finally {
        if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
        // The only recursive cleanup target is the absolute directory returned by mkdtemp.
        await rm(directory, { recursive: true, force: true });
      }
    }
  } finally {
    await writeFile(path.join(evidenceRoot, "results.json"), JSON.stringify({
      node: process.version, platform: process.platform, browser: browser.version(), cases,
    }, null, 2) + "\n");
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await checkReactMenuCompatibility();
