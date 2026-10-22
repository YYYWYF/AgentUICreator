import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { analyzePluginServiceDeclarations } from "../src/project/service-dependency-inspector";
import type { PluginAsset } from "../src/project/types";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function inspect(declarationPath: string | undefined) {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "npm services 空格 "));
  roots.push(projectRoot);
  const managedSourceRoot = path.join(projectRoot, "src/agent-ui");
  await mkdir(managedSourceRoot, { recursive: true });
  await writeFile(path.join(projectRoot, "tsconfig.json"), JSON.stringify({ compilerOptions: { module: "ESNext", moduleResolution: "Bundler" }, include: ["src/**/*.ts"] }));
  if (declarationPath) {
    const file = path.join(managedSourceRoot, declarationPath);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, 'export const AUTH_SESSION_SERVICE = "auth.session";\nexport interface AuthSessionService { getSnapshot(): { user: null }; }\n');
  }
  const assets = [{ pluginId: "auth-gate", ownership: "official_package" }, { pluginId: "auth-account", ownership: "official_package" }] as PluginAsset[];
  return analyzePluginServiceDeclarations(projectRoot, assets, managedSourceRoot);
}
it("resolves real npm service contracts without source-owned imports", async () => {
  const declarations = await inspect("services/auth/session.ts");
  expect([...declarations.seamPaths.get("auth.session") ?? []]).toEqual(["src/agent-ui/services/auth/session.ts"]);
});
it("does not invent missing service contracts from npm metadata", async () => {
  expect((await inspect(undefined)).seamPaths.has("auth.session")).toBe(false);
});
it("retains the services directory boundary", async () => {
  expect((await inspect("plugins/auth-gate/session.ts")).seamPaths.has("auth.session")).toBe(false);
});
