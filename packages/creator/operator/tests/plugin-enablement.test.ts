import { mkdtemp, mkdir, readFile, rm, symlink, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { preparePluginEnablement, completePluginEnablement } from "../src/project/plugin-enablement";
import { repositoryRoot } from "./support/generated-project";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "enable plugin 空间-")); roots.push(root);
  await mkdir(path.join(root, ".agent-ui"));
  await mkdir(path.join(root, "src/ui/app-ui"), { recursive: true });
  const host = path.join(repositoryRoot, "examples/creator-host-sandbox");
  await writeFile(path.join(root, "package.json"), await readFile(path.join(host, "package.json")));
  await symlink(path.join(host, "node_modules"), path.join(root, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  await writeFile(path.join(root, ".agent-ui/project.json"), JSON.stringify({ mode: "assistant", sourceRoot: "src/ui" }));
  await writeFile(path.join(root, "src/ui/app-ui/app-ui.json"), JSON.stringify({ root: { type: "slot", plugins: [] } }));
  return root;
}
it("previews missing application files without writing; confirmed preparation leaves layout untouched", async () => {
  const root = await fixture();
  const model = await readFile(path.join(root, "src/ui/app-ui/app-ui.json"));
  const plan = await preparePluginEnablement(root, "composer");
  expect(plan.files).toContain("src/ui/plugins/composer/index.tsx");
  expect(plan.files.every(file => !file.includes("\\"))).toBe(true);
  await expect(readFile(path.join(root, "src/ui/plugins/composer/index.tsx"))).rejects.toMatchObject({ code: "ENOENT" });
  expect(plan.packages).toEqual([]);
  const run = vi.fn();
  await completePluginEnablement(root, plan, run);
  expect(run).not.toHaveBeenCalled();
  expect(await readFile(path.join(root, "src/ui/app-ui/app-ui.json"))).toEqual(model);
  const after = await preparePluginEnablement(root, "composer");
  expect(after.files).toEqual([]);
});
it("restores only missing files and preserves customized application code", async () => {
  const root = await fixture();
  await completePluginEnablement(root, await preparePluginEnablement(root, "composer"), vi.fn());
  const entry = path.join(root, "src/ui/plugins/composer/index.tsx");
  const custom = 'export const custom = "keep my application";\r\n';
  await writeFile(entry, custom);
  await unlink(path.join(root, "src/ui/plugins/composer/definition.ts"));
  const plan = await preparePluginEnablement(root, "composer");
  expect(plan.files).toEqual(["src/ui/plugins/composer/definition.ts"]);
  await completePluginEnablement(root, plan, vi.fn());
  expect(await readFile(entry, "utf8")).toBe(custom);
});
it("rejects a plan after layout, dependency or application state changes before writing", async () => {
  const root = await fixture();
  const plan = await preparePluginEnablement(root, "composer");
  await writeFile(path.join(root, "package-lock.json"), "changed lock state\r\n");
  await expect(completePluginEnablement(root, plan, vi.fn())).rejects.toThrow("PLUGIN_ENABLEMENT_PREPARATION_STALE");
  await expect(readFile(path.join(root, "src/ui/plugins/composer/index.tsx"))).rejects.toMatchObject({ code: "ENOENT" });
});
it("does not overwrite unknown existing files or expose non-plugin resource IDs", async () => {
  const root = await fixture();
  await mkdir(path.join(root, "src/ui/plugins/composer"), { recursive: true });
  await writeFile(path.join(root, "src/ui/plugins/composer/index.tsx"), "custom");
  await expect(preparePluginEnablement(root, "composer")).rejects.toThrow("Existing Plugin code must be preserved");
  await expect(preparePluginEnablement(root, "web-component-bridge")).rejects.toThrow("PLUGIN_UNAVAILABLE");
});
it("previews missing declarations, installs only after confirmation and checks the result", async () => {
  const root = await fixture();
  const file = path.join(root, "package.json");
  const manifest = JSON.parse(await readFile(file, "utf8"));
  const original = JSON.stringify(manifest);
  delete manifest.dependencies.react;
  await writeFile(file, JSON.stringify(manifest));
  const plan = await preparePluginEnablement(root, "composer");
  expect(plan.packages.some(item => item.name === "react")).toBe(true);
  const run = vi.fn(async (_root, command) => {
    expect(command.args).toContain("--save-exact");
    await writeFile(file, original);
  });
  await completePluginEnablement(root, plan, run);
  expect(run).toHaveBeenCalledOnce();
  expect((await preparePluginEnablement(root, "composer")).packages).toEqual([]);
});
it("dependency failure leaves application files absent and never claims preparation complete", async () => {
  const root = await fixture();
  const file = path.join(root, "package.json");
  const manifest = JSON.parse(await readFile(file, "utf8"));
  delete manifest.dependencies.react;
  await writeFile(file, JSON.stringify(manifest));
  const plan = await preparePluginEnablement(root, "composer");
  await expect(completePluginEnablement(root, plan, async () => { throw new Error("install failed"); })).rejects.toThrow("install failed");
  await expect(readFile(path.join(root, "src/ui/plugins/composer/index.tsx"))).rejects.toMatchObject({ code: "ENOENT" });
});
