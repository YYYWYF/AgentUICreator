import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { createCreatorDevServerPlugin } from "../src/vitePlugin.js";
import { CREATOR_WORKSPACE_API_PATH } from "../src/workspace/types.js";

const roots: string[] = [];
const servers: ViteDevServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => server.close()));
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function project() {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "creator 工程 with spaces-")));
  roots.push(root);
  await writeFile(path.join(root, "package.json"), JSON.stringify({ private: true, type: "module" }));
  await writeFile(path.join(root, "index.html"), '<script type="module">/* HTML fallback */</script>');
  return root;
}

it("serves the workspace API with only projectRoot, including refresh, switch and clear", async () => {
  const root = await project();
  const otherRoot = await project();
  const server = await createServer({
    configFile: false, root, logLevel: "silent",
    plugins: [createCreatorDevServerPlugin({ projectRoot: root, runtime: { environment: {}, log: () => {} } })],
    server: { host: "127.0.0.1", port: 0, hmr: false },
  });
  servers.push(server);
  await server.listen();
  const base = `${server.resolvedUrls!.local[0]!.replace(/\/$/, "")}${CREATOR_WORKSPACE_API_PATH}`;
  const state = await fetch(base);
  expect(state.headers.get("content-type")).toContain("application/json");
  expect(await state.json()).toMatchObject({ status: "uninitialized", workspace: { displayPath: root } });
  const post = async (route: string, body = {}) => {
    const response = await fetch(`${base}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect(response.headers.get("content-type")).toContain("application/json");
    return response.json();
  };
  expect(await post("/refresh")).toMatchObject({ status: "uninitialized", workspace: { displayPath: root } });
  expect(await post("/select", { projectRoot: otherRoot })).toMatchObject({ status: "uninitialized", workspace: { displayPath: otherRoot } });
  expect(await post("/refresh")).toMatchObject({ workspace: { displayPath: otherRoot } });
  expect(await post("/clear")).toEqual({ status: "none" });
  expect(await (await fetch(base)).json()).toEqual({ status: "none" });
});
