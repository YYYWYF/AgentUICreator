import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { get } from "node:http";
import { startCreatorWorkbench } from "../src/standaloneServer.js";
import { browserInvocation } from "../src/openBrowser.js";

const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

async function browserFiles() {
  const root = await mkdtemp(path.join(tmpdir(), "creator browser 中文 "));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "index.html"), '<script src="./assets/app.js"></script>');
  await mkdir(path.join(root, "assets"));
  await writeFile(path.join(root, "assets/app.js"), "console.log('browser');");
  return root;
}

it("serves packaged assets and routes APIs with stripped prefixes and queries", async () => {
  const dispose = vi.fn(async () => {});
  const app = await startCreatorWorkbench({ port: 0, browserRoot: await browserFiles(), service: {
    dispose,
    mount(middlewares) {
      middlewares.use("/__creator/example", async (request, response) => {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ route: request.url }));
      });
    },
  } });
  cleanups.push(app.close);
  expect(await (await fetch(app.url)).text()).toContain("assets/app.js");
  const asset = await fetch(`${app.url}assets/app.js`);
  expect(asset.headers.get("content-type")).toContain("javascript");
  expect(await (await fetch(`${app.url}__creator/example/child?q=1`)).json()).toEqual({ route: "/child?q=1" });
  expect((await fetch(`${app.url}__creator/examples`)).status).toBe(404);
  expect((await fetch(`${app.url}assets/missing.js`)).status).toBe(404);
  expect((await fetch(app.url, { method: "HEAD" })).headers.get("content-type")).toContain("html");
  await Promise.all([app.close(), app.close()]);
  expect(dispose).toHaveBeenCalledTimes(1);
  await expect(fetch(app.url)).rejects.toThrow();
});

it("rejects encoded traversal, Windows separators, foreign origins and hosts", async () => {
  const app = await startCreatorWorkbench({ port: 0, browserRoot: await browserFiles(), service: { mount() {}, dispose: async () => {} } });
  cleanups.push(app.close);
  expect((await fetch(`${app.url}%2e%2e%2fpackage.json`)).status).toBe(403);
  expect((await fetch(`${app.url}C%3A%5CWindows%5Cfile`)).status).toBe(403);
  expect((await fetch(app.url, { headers: { Origin: "https://other.example" } })).status).toBe(403);
  const hostStatus = await new Promise<number | undefined>((resolve, reject) => {
    get(app.url, { headers: { Host: "other.example" } }, response => { response.resume(); resolve(response.statusCode); }).once("error", reject);
  });
  expect(hostStatus).toBe(403);
});

it("releases services when the requested port cannot be bound", async () => {
  const root = await browserFiles();
  const first = await startCreatorWorkbench({ port: 0, browserRoot: root, service: { mount() {}, dispose: async () => {} } });
  cleanups.push(first.close);
  const dispose = vi.fn(async () => {});
  await expect(startCreatorWorkbench({ port: Number(new URL(first.url).port), browserRoot: root, service: { mount() {}, dispose } })).rejects.toMatchObject({ code: "EADDRINUSE" });
  expect(dispose).toHaveBeenCalledTimes(1);
});

it("uses direct Windows executable arguments to open the browser", () => {
  const url = "http://127.0.0.1:47832/";
  expect(browserInvocation(url, "win32")).toEqual({ command: "rundll32.exe", args: ["url.dll,FileProtocolHandler", url] });
  expect(browserInvocation(url, "darwin")).toEqual({ command: "open", args: [url] });
  expect(browserInvocation(url, "linux")).toEqual({ command: "xdg-open", args: [url] });
});
