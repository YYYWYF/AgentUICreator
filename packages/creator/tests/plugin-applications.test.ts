import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareCompositionApplications } from "../src/agent/plugin-applications.js";
import { RunActivity } from "../src/agent/activity.js";
import type { ToolContext } from "../src/agent/tools.js";

const repository = fileURLToPath(new URL("../../../", import.meta.url)), roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "creator application 中文-")); roots.push(root);
  const host = path.join(repository, "examples/creator-host-sandbox");
  await mkdir(path.join(root, ".agent-ui")); await mkdir(path.join(root, "src/ui"), { recursive: true });
  await writeFile(path.join(root, "package.json"), await readFile(path.join(host, "package.json")));
  await symlink(path.join(host, "node_modules"), path.join(root, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  await writeFile(path.join(root, ".agent-ui/project.json"), JSON.stringify({ mode: "platform", sourceRoot: "src/ui" }));
  await writeFile(path.join(root, "src/ui/app-ui.json"), '{"root":{"type":"slot","plugins":[]}}');
  const signal = new AbortController().signal;
  const context: ToolContext = { root, threadId: "application", skills: "", contracts: "", signal,
    readOnly: false, userMessage: "增加主题切换控件", groups: new Set(), authorizedPlugins: new Set(),
    diagnostics: new Map(), verificationMode: "static_only", activity: new RunActivity(root, "application", signal) };
  return { root, context, entry: path.join(root, "src/ui/plugins/theme-switch/index.tsx") };
}
const insert = (pluginId: string) => ({ type: "insert_plugin", plugin: { pluginId } });

it("prepares a requested installed Plugin's thin application without an extra question or source takeover", async () => {
  const f = await fixture(), before = await readFile(path.join(f.root, "package.json"), "utf8");
  await expect(prepareCompositionApplications(f.context, { operations: [insert("theme-switch")] })).resolves.toBeUndefined();
  expect(await readFile(f.entry, "utf8")).toContain("usePluginService");
  expect(await readFile(f.entry, "utf8")).toContain("service={service}");
  const receipt = await f.context.activity.persist();
  expect(receipt.files.some(file => file.path === "src/ui/plugins/theme-switch/index.tsx")).toBe(true);
  expect(receipt.transaction.undoable).toBe(true);
  expect(receipt.files.every(file => !/\/(?:source|vendor|upstream)\//u.test(file.path))).toBe(true);
  expect(await readFile(path.join(f.root, "src/ui/app-ui.json"), "utf8")).toBe('{"root":{"type":"slot","plugins":[]}}');
  expect(await readFile(path.join(f.root, "package.json"), "utf8")).toBe(before);
}, 30000);

it("preserves an existing customized application on later composition", async () => {
  const f = await fixture();
  await prepareCompositionApplications(f.context, { operations: [insert("theme-switch")] });
  const custom = (await readFile(f.entry, "utf8")) + "\n// Project customization\n";
  await writeFile(f.entry, custom);
  await prepareCompositionApplications(f.context, { operations: [insert("theme-switch")] });
  expect(await readFile(f.entry, "utf8")).toBe(custom);
});

it("prepares multiple applications against fresh shared Host bindings", async () => {
  const f = await fixture();
  await prepareCompositionApplications(f.context, { operations: [insert("theme-switch"), insert("locale-switch")] });
  expect(await readFile(f.entry, "utf8")).toContain("service={service}");
  expect(await readFile(path.join(f.root, "src/ui/plugins/locale-switch/index.tsx"), "utf8")).toContain("service={service}");
});

it("keeps dependency installation outside ordinary application preparation", async () => {
  const f = await fixture(), file = path.join(f.root, "package.json"), manifest = JSON.parse(await readFile(file, "utf8"));
  delete manifest.dependencies["@za38.03/agent-ui-plugins"];
  await writeFile(file, JSON.stringify(manifest));
  const before = await readFile(file, "utf8");
  await expect(prepareCompositionApplications(f.context, { operations: [insert("theme-switch")] })).rejects.toThrow("PLUGIN_ENABLEMENT_DEPENDENCIES_REQUIRED");
  expect(await readFile(file, "utf8")).toBe(before);
  await expect(readFile(f.entry)).rejects.toMatchObject({ code: "ENOENT" });
});

it("never creates application files for a read-only request", async () => {
  const f = await fixture(); f.context.readOnly = true;
  await expect(prepareCompositionApplications(f.context, { operations: [insert("theme-switch")] })).rejects.toThrow("TOOL_PERMISSION_DENIED");
  await expect(readFile(f.entry)).rejects.toMatchObject({ code: "ENOENT" });
});
