import { mkdtemp, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { build, createServer } from "vite";
import { createDevelopmentEnvironmentInstaller } from "../src/project/development-defaults";
import { localEnvViteSource } from "../src/project/development-env-template";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture(config = 'export default { server: { host: "127.0.0.1" } };\n') {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent ui env 空格 "));
  roots.push(root);
  await writeFile(path.join(root, "package.json"), '{"type":"module"}');
  await writeFile(path.join(root, "vite.config.ts"), config);
  return root;
}

it("installs an independent adapter, preserves config expressions, and rolls edits back", async () => {
  const original = 'export default async () => ({ server: { port: 1234 } });\r\n';
  const root = await fixture(original);
  await writeFile(path.join(root, ".gitignore"), "node_modules/\r\n");
  const installer = createDevelopmentEnvironmentInstaller();
  const created = await installer.install(root);
  expect(created).toContain(".env.agentui.local");
  expect(await readFile(path.join(root, "agentui.vite-env.mjs"), "utf8")).toBe(localEnvViteSource);
  expect(await readFile(path.join(root, "vite.config.ts"), "utf8")).toContain("__withAgentUILocalEnv(async () =>");
  expect(await installer.install(root)).toEqual([]);
  await installer.rollback(root);
  expect(await readFile(path.join(root, "vite.config.ts"), "utf8")).toBe(original);
  expect(await readFile(path.join(root, ".gitignore"), "utf8")).toBe("node_modules/\r\n");
});

it("restores configuration if initialization fails after environment installation", async () => {
  const root = await fixture('export const config = {};\n');
  await expect(createDevelopmentEnvironmentInstaller().install(root)).rejects.toThrow("VITE_CONFIG_UNSUPPORTED");
  await expect(readFile(path.join(root, ".env.agentui.local"))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(readFile(path.join(root, "agentui.vite-env.mjs"))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(readFile(path.join(root, ".gitignore"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("exposes only the public endpoint in dev, blocks file downloads, and excludes local settings from production", async () => {
  const root = await fixture();
  await createDevelopmentEnvironmentInstaller().install(root);
  await writeFile(path.join(root, ".env.agentui.local"), 'CREATOR_MODEL_API_KEY=SECRET_CANARY_DO_NOT_SHIP\r\nVITE_UNAPPROVED_SECRET=ALSO_PRIVATE_CANARY\r\nexport VITE_AGENT_ENDPOINT="http://127.0.0.1:47831/agent"\r\n');
  await writeFile(path.join(root, "index.html"), '<script type="module" src="/main.js"></script>');
  await writeFile(path.join(root, "main.js"), 'globalThis.settings = import.meta.env; console.log(import.meta.env.VITE_AGENT_ENDPOINT);');
  const server = await createServer({ root, server: { port: 0, host: "127.0.0.1" } });
  try {
    await server.listen();
    expect(server.config.env.VITE_AGENT_ENDPOINT).toBe("http://127.0.0.1:47831/agent");
    const address = server.httpServer!.address() as { port: number };
    const origin = `http://127.0.0.1:${address.port}`;
    const javascript = await (await fetch(`${origin}/main.js`)).text();
    expect(javascript).toContain("http://127.0.0.1:47831/agent");
    expect(javascript).not.toMatch(/SECRET_CANARY|ALSO_PRIVATE|CREATOR_MODEL_API_KEY/);
    for (const url of ["/.env.agentui.local", "/.env.agentui.local?raw", `/@fs/${path.join(root, ".env.agentui.local").replaceAll("\\", "/")}?raw`]) {
      const response = await fetch(origin + url);
      expect(await response.text()).not.toMatch(/SECRET_CANARY|ALSO_PRIVATE/);
    }
  } finally { await server.close(); }
  const result = await build({ root, logLevel: "silent", build: { write: false, minify: false } });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(item => "output" in item ? item.output : []);
  const javascript = outputs.map(item => item.type === "chunk" ? item.code : String(item.source)).join("\n");
  expect(javascript).not.toMatch(/SECRET_CANARY|ALSO_PRIVATE|47831|CREATOR_MODEL_API_KEY|agentui.vite-env|node:fs/);
});

it("keeps ordinary Vite environment settings above the dedicated local fallback", async () => {
  const root = await fixture();
  await createDevelopmentEnvironmentInstaller().install(root);
  await writeFile(path.join(root, ".env.development.local"), "VITE_AGENT_ENDPOINT=https://user.example/agent\n");
  const server = await createServer({ root });
  try { expect(server.config.env.VITE_AGENT_ENDPOINT).toBe("https://user.example/agent"); }
  finally { await server.close(); }
});

it("supports CommonJS Vite configurations without changing the module format", async () => {
  const root = await fixture('module.exports = { server: { host: "127.0.0.1" } };\n');
  await rename(path.join(root, "vite.config.ts"), path.join(root, "vite.config.cjs"));
  await createDevelopmentEnvironmentInstaller().install(root);
  const server = await createServer({ root });
  try { expect(server.config.env.VITE_AGENT_ENDPOINT).toBe("http://127.0.0.1:47831/agent"); }
  finally { await server.close(); }
});


it("creates a working Vite configuration when the project has none", async () => {
  const root = await fixture();
  await unlink(path.join(root, "vite.config.ts"));
  const paths = await createDevelopmentEnvironmentInstaller().install(root);
  expect(paths).toContain("vite.config.mjs");
  await expect(readFile(path.join(root, ".env.development.local"))).rejects.toMatchObject({ code: "ENOENT" });
  const server = await createServer({ root });
  try { expect(server.config.env.VITE_AGENT_ENDPOINT).toBe("http://127.0.0.1:47831/agent"); }
  finally { await server.close(); }
});
