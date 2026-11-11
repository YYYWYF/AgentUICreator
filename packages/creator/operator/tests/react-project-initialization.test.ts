import { afterEach, expect, test } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir, realpath, rename, symlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { planReactAgentUIProject, initializeReactAgentUIProject } from "../src/project/react-project-initialization";
import { createDefaultAgentUIPresetRegistry, agentUIModeRegistry } from "../src/bootstrap/index";
import { loadAgentUISourceRegistry } from "../src/source-catalog/index";
import { resolveAgentUISourceItems } from "../src/project/source-registry/installer";
import { createAgentUIInitializationHost } from "../src/project/bootstrap-host";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function host(extra: Record<string, unknown> = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "creator init 空格-")); roots.push(root);
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src/host.ts"), "// preserve host\r\n");
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "host", private: true, packageManager: "pnpm@8.12.0", devDependencies: { "@za38.03/agent-ui-creator": "0.0.1" }, ...extra }));
  return { projectRoot: await realpath(root), mode: "platform" as const, sourceRoot: "src/agent-ui" };
}
async function installed(root: string, name: string, version: string) {
  const directory = path.join(root, "node_modules", ...name.split("/"));
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "package.json"), JSON.stringify({ name, version }));
}
test("Creator-only planning is read-only and includes all direct default-template imports", async () => {
  const input = await host(); const before = await readdir(input.projectRoot);
  const result = await planReactAgentUIProject(input);
  expect(result.valid).toBe(true);
  expect(result.dependencyPlan).toMatchObject({ projectRoot: input.projectRoot, manager: "pnpm", installRequired: true });
  expect(result.dependencyPlan!.packageJsonPath).toBe(path.join(input.projectRoot, "package.json"));
  for (const name of ["core", "renderer", "runtime", "plugins"]) expect(result.dependencyPlan!.dependencies[`@za38.03/agent-ui-${name}`]).toMatch(/^\d+\.\d+\.\d+/);
  expect(result.dependencyPlan!.dependencies["lucide-react"]).toBe("1.41.0");
  expect(result.dependencyPlan!.dependencies["zod"]).toBe("4.5.4");
  expect(result.dependencyPlan!.devDependencies["tailwindcss"]).toBe("4.3.3");
  expect(result.dependencyPlan!.devDependencies).not.toHaveProperty("@tailwindcss/vite");
  expect(result.dependencyPlan!.installCommand).toBe("pnpm install");
  expect(result.dependencyPlan!.dependencies).toHaveProperty("react-dom");
  expect(result.dependencyPlan!.dependencies).not.toHaveProperty("@za38.03/agent-ui-creator");
  expect(result.dependencyPlan!.dependencies).not.toHaveProperty("@za38.03/agent-ui-web-component");
  expect(await readdir(input.projectRoot)).toEqual(before);
  for (const mode of ["assistant", "embedded"] as const) expect((await planReactAgentUIProject({ ...input, mode })).dependencyPlan!.dependencies).toEqual(result.dependencyPlan!.dependencies);
});

test("planning and initialization use the project's newer Plugins resources without the Creator version pin", async () => {
  const pluginName = "@za38.03/agent-ui-plugins";
  const coreName = "@za38.03/agent-ui-core";
  const input = await host({ dependencies: { [pluginName]: "0.0.8", [coreName]: "0.0.9" } });
  await installed(input.projectRoot, coreName, "0.0.9");
  const registry = await loadAgentUISourceRegistry();
  const packageRoot = path.join(input.projectRoot, "node_modules", ...pluginName.split("/"));
  const resourceRoot = path.join(packageRoot, "dist/resources/registry");
  await mkdir(resourceRoot, { recursive: true });
  await writeFile(path.join(packageRoot, "package.json"), JSON.stringify({ name: pluginName, version: "0.0.8", exports: {
    "./source-registry/registry.json": "./dist/resources/registry/registry.json",
  } }));
  const entries = [];
  for (const item of registry.items) {
    const relative = path.relative(registry.root, item.manifestPath).split(path.sep).join("/");
    entries.push({ id: item.id, path: relative });
    const manifestPath = path.join(resourceRoot, ...relative.split("/"));
    await mkdir(path.dirname(manifestPath), { recursive: true });
    const { id, kind, description, upstream, requires, packages, files } = item;
    await writeFile(manifestPath, JSON.stringify({ id, kind, description, upstream, requires, packages, files }));
    for (const file of item.loadedFiles) {
      const target = path.join(path.dirname(manifestPath), ...file.source.split("/"));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.target === "index.ts" ? Buffer.concat([file.content, Buffer.from("\n// project-installed template\n")]) : file.content);
    }
  }
  await writeFile(path.join(resourceRoot, "registry.json"), JSON.stringify({ items: entries }));
  // Resolve a pnpm-style package location through a Windows junction (spaces and Unicode included).
  const storeRoot = path.join(input.projectRoot, ".store", "Plugins 安装目录");
  await mkdir(path.dirname(storeRoot), { recursive: true });
  await rename(packageRoot, storeRoot);
  await symlink(storeRoot, packageRoot, process.platform === "win32" ? "junction" : "dir");
  const before = await readFile(path.join(input.projectRoot, "package.json"), "utf8");
  const plan = (await planReactAgentUIProject(input)).dependencyPlan!;
  expect(plan.packages.find(item => item.name === pluginName)).toMatchObject({ version: "0.0.8", action: "reuse", required: ["0.0.8"] });
  expect(plan.dependencies).not.toHaveProperty(pluginName);
  expect(plan.packages.find(item => item.name === coreName)).toMatchObject({ version: "0.0.9", action: "reuse" });
  expect(plan.dependencies).not.toHaveProperty(coreName);
  expect(await readFile(path.join(input.projectRoot, "package.json"), "utf8")).toBe(before);
  for (const pkg of plan.packages) if (pkg.name !== pluginName) await installed(input.projectRoot, pkg.name, pkg.version);
  const config = { mode: input.mode, sourceRoot: input.sourceRoot };
  const preset = createDefaultAgentUIPresetRegistry(value => value).getDefaultForMode(input.mode, agentUIModeRegistry);
  const initialization = createAgentUIInitializationHost();
  await initialization.preflightSources(input.projectRoot, preset.sourceItems!, config);
  await initialization.installSources(input.projectRoot, preset.sourceItems!, config);
  expect(await readFile(path.join(input.projectRoot, input.sourceRoot, "index.ts"), "utf8")).toContain("project-installed template");
  const lock = JSON.parse(await readFile(path.join(input.projectRoot, ".agent-ui/source-lock.json"), "utf8"));
  expect(lock.items["plugin/composer"]).toBeUndefined();
});
test("every external package imported by generated foundation/shell source is declared in the template closure", async () => {
  const registry = await loadAgentUISourceRegistry();
  const presets = createDefaultAgentUIPresetRegistry(value => value);
  for (const mode of ["assistant", "embedded", "platform"] as const) {
    const preset = presets.getDefaultForMode(mode, agentUIModeRegistry);
    const closure = resolveAgentUISourceItems(registry, preset.sourceItems ?? []);
    const packages = new Set(closure.flatMap(item => Object.keys(item.packages ?? {})));
    for (const item of closure) for (const file of item.loadedFiles) {
      if (!/\.[jt]sx?$/.test(file.target)) continue;
      for (const match of file.content.toString().matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/g)) {
        const specifier = match[1]!;
        if (specifier.startsWith(".") || specifier.startsWith("/")) continue;
        const name = specifier.split("/").slice(0, specifier.startsWith("@") ? 2 : 1).join("/");
        expect(packages.has(name), `${mode}: ${file.target} imports undeclared package ${name}`).toBe(true);
      }
    }
  }
});

test("does not silently substitute Creator resources for an installed Plugins package missing its resources", async () => {
  const input = await host({ dependencies: { "@za38.03/agent-ui-plugins": "0.0.8" } });
  await installed(input.projectRoot, "@za38.03/agent-ui-plugins", "0.0.8");
  await expect(planReactAgentUIProject(input)).rejects.toMatchObject({ code: "MODULE_NOT_FOUND" });
  await expect(readFile(path.join(input.projectRoot, ".agent-ui/project.json"))).rejects.toMatchObject({ code: "ENOENT" });
});
test("reuses the host React major and preserves incompatible declarations for review", async () => {
  const input = await host({ dependencies: { react: "^18.3.1", "react-dom": "18.3.1" } });
  await installed(input.projectRoot, "react", "18.3.1"); await installed(input.projectRoot, "react-dom", "18.3.1");
  const result = await planReactAgentUIProject(input);
  expect(result.dependencyPlan!.dependencies).not.toHaveProperty("react");
  expect(result.dependencyPlan!.packages.find(item => item.name === "react")).toMatchObject({ action: "reuse", version: "18.3.1" });
  await installed(input.projectRoot, "react", "20.0.0");
  await expect(planReactAgentUIProject(input)).rejects.toMatchObject({ code: "AGENT_UI_SETUP_DEPENDENCY_CONFLICT" });
});
test("rejects unconfirmed and stale manifest/lock/registry plans before preparing declarations", async () => {
  const input = await host();
  await expect(initializeReactAgentUIProject(input)).rejects.toMatchObject({ code: "AGENT_UI_SETUP_PLAN_STALE" });
  const plan = (await planReactAgentUIProject(input)).dependencyPlan!;
  await expect(initializeReactAgentUIProject({ ...input, mode: "assistant", planId: plan.id })).rejects.toMatchObject({ code: "AGENT_UI_SETUP_PLAN_STALE" });
  await writeFile(path.join(input.projectRoot, ".npmrc"), "registry=https://example.invalid/\n");
  await expect(initializeReactAgentUIProject({ ...input, planId: plan.id })).rejects.toMatchObject({ code: "AGENT_UI_SETUP_PLAN_STALE" });
  const next = (await planReactAgentUIProject(input)).dependencyPlan!;
  await writeFile(path.join(input.projectRoot, "pnpm-lock.yaml"), "lockfileVersion: '6.0'\n");
  await expect(initializeReactAgentUIProject({ ...input, planId: next.id })).rejects.toMatchObject({ code: "AGENT_UI_SETUP_PLAN_STALE" });
  const current = (await planReactAgentUIProject(input)).dependencyPlan!;
  await writeFile(path.join(input.projectRoot, "package.json"), '{"name":"user-edit"}');
  await expect(initializeReactAgentUIProject({ ...input, planId: current.id })).rejects.toMatchObject({ code: "AGENT_UI_SETUP_PLAN_STALE" });
  expect(await readFile(path.join(input.projectRoot, "src/host.ts"), "utf8")).toBe("// preserve host\r\n");
});
test.each(["npm", "pnpm"] as const)("prepares declarations only for %s and leaves installation, locks and custom build configuration to the user", async manager => {
  const input = await host({ packageManager: `${manager}@${manager === "npm" ? "10.9.2" : "8.12.0"}`, dependencies: { "host-library": "1.2.3" }, scripts: { build: "my-custom-build" } });
  const lock = manager === "npm" ? "package-lock.json" : "pnpm-lock.yaml";
  await writeFile(path.join(input.projectRoot, lock), "unchanged lock\r\n");
  const configs = { "vite.config.ts": "export default configureHost();\n", "rsbuild.config.ts": "export default customFactory();\n", "webpack.config.cjs": "module.exports = require('./my-config');\n", "postcss.config.mjs": "export default { plugins: { 'host-postcss': {} } };\n" };
  for (const [file, content] of Object.entries(configs)) await writeFile(path.join(input.projectRoot, file), content);
  const plan = (await planReactAgentUIProject(input)).dependencyPlan!;
  expect(await initializeReactAgentUIProject({ ...input, planId: plan.id })).toMatchObject({ status: "dependencies-prepared", installCommand: `${manager} install` });
  const manifest = JSON.parse(await readFile(path.join(input.projectRoot, "package.json"), "utf8"));
  expect(manifest.dependencies).toMatchObject({ "host-library": "1.2.3", ...plan.dependencies });
  expect(manifest.devDependencies).toMatchObject({ "@za38.03/agent-ui-creator": "0.0.1", ...plan.devDependencies });
  expect(manifest.scripts).toEqual({ build: "my-custom-build" });
  expect(await readFile(path.join(input.projectRoot, lock), "utf8")).toBe("unchanged lock\r\n");
  for (const [file, content] of Object.entries(configs)) expect(await readFile(path.join(input.projectRoot, file), "utf8")).toBe(content);
  expect(await readdir(path.join(input.projectRoot, "src"))).toEqual(["host.ts"]);
  await expect(readFile(path.join(input.projectRoot, "node_modules/lucide-react/package.json"))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(readFile(path.join(input.projectRoot, ".agent-ui/project.json"))).rejects.toMatchObject({ code: "ENOENT" });
  const prepared = (await planReactAgentUIProject(input)).dependencyPlan!;
  expect(prepared.dependencies).toEqual({}); expect(prepared.devDependencies).toEqual({});
  expect(prepared.installRequired).toBe(true);
  await expect(initializeReactAgentUIProject({ ...input, planId: prepared.id })).rejects.toMatchObject({ code: "AGENT_UI_SETUP_INSTALL_REQUIRED" });
});
test("blocks interrupted legacy installs, shared workspaces and mismatched managers", async () => {
  const input = await host();
  await mkdir(path.join(input.projectRoot, ".agent-ui/creator"), { recursive: true });
  await writeFile(path.join(input.projectRoot, ".agent-ui/creator/dependency-install.json"), JSON.stringify({ stage: "installing" }));
  await expect(planReactAgentUIProject(input)).rejects.toMatchObject({ code: "AGENT_UI_SETUP_INSTALL_REVIEW_REQUIRED" });
  await rm(path.join(input.projectRoot, ".agent-ui"), { recursive: true });
  await writeFile(path.join(input.projectRoot, "package-lock.json"), "{}");
  await expect(planReactAgentUIProject(input)).rejects.toMatchObject({ code: "AGENT_UI_SETUP_MANAGER_UNSUPPORTED" });
  await writeFile(path.join(input.projectRoot, "pnpm-workspace.yaml"), 'packages: ["."]');
  await expect(planReactAgentUIProject(input)).rejects.toMatchObject({ code: "AGENT_UI_SETUP_WORKSPACE_UNSUPPORTED" });
});
