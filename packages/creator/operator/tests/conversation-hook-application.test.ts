import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import { ensurePluginApplication, readApplicationCompositionManifest, readApplicationPackageManifest } from "../src/project/plugin-application";
import { verifyPluginChildSlots } from "../src/project/plugin-child-slot-verifier";
import { resourcePaths } from "../src/project/optional-resource-paths";

const repository = fileURLToPath(new URL("../../../../", import.meta.url));
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function fixture(ids = ["conversation-thread-list", "conversation-surface"]) {
  const root = await mkdtemp(path.join(tmpdir(), "conversation hook 测试-")); roots.push(root);
  const installed = path.join(root, "node_modules/@za38.03/agent-ui-plugins");
  await mkdir(path.join(installed, "dist"), { recursive: true });
  const owner = path.join(repository, "packages/plugins");
  await cp(path.join(owner, "package.json"), path.join(installed, "package.json"));
  await cp(path.join(owner, "dist/catalog.json"), path.join(installed, "dist/catalog.json"));
  for (const id of ids) {
    for (const relative of [`dist/${id}`, `dist/sources/plugins/${id}`, `dist/sources/takeover/${id}`]) {
      await cp(path.join(owner, relative), path.join(installed, relative), { recursive: true });
    }
  }
  await cp(path.join(owner, "dist/sources/shared/project/services"), path.join(installed, "dist/sources/shared/project/services"), { recursive: true });
  await mkdir(path.join(root, ".agent-ui"));
  await writeFile(path.join(root, "package.json"), '{"type":"module"}');
  await writeFile(path.join(root, ".agent-ui/project.json"), '{"mode":"assistant","sourceRoot":"src/custom-ui"}');
  return { root, installed, context: await resourcePaths(root) };
}

it("adds project application Slots without replacing installed contracts or source ownership", async () => {
  const { root, context } = await fixture(["composer"]);
  await ensurePluginApplication(root, "composer", context);
  const file = path.join(context.paths.pluginsRoot, "composer/manifest.json");
  const installed = JSON.parse(await readApplicationPackageManifest(root, "composer"));
  const local = JSON.parse(await readFile(file, "utf8"));
  local.name = "Project display name"; local.version = "9.9.9";
  local.slots.children.testHint = { description: "Project hint", cardinality: "many", optional: true };
  await writeFile(file, JSON.stringify(local));
  const before = await readFile(path.join(root, ".agent-ui/source-lock.json"), "utf8");
  const result = JSON.parse(await readApplicationCompositionManifest(root, "composer", file));
  expect(result.name).toBe(installed.name); expect(result.version).toBe(installed.version);
  expect(result.slots.children).toEqual({ ...installed.slots.children, testHint: local.slots.children.testHint });
  expect(await readFile(path.join(root, ".agent-ui/source-lock.json"), "utf8")).toBe(before);
});

it.each(["override", "remove", "identity"])("rejects an application extension with canonical %s changes", async kind => {
  const { root, context } = await fixture(["composer"]); await ensurePluginApplication(root, "composer", context);
  const file = path.join(context.paths.pluginsRoot, "composer/manifest.json");
  const local = JSON.parse(await readFile(file, "utf8"));
  local.slots.children.testHint = { description: "Project hint", cardinality: "many", optional: true };
  if (kind === "override") local.slots.children.input.cardinality = "many";
  if (kind === "remove") delete local.slots.children.input;
  if (kind === "identity") local.id = "another";
  await writeFile(file, JSON.stringify(local));
  await expect(readApplicationCompositionManifest(root, "composer", file)).rejects.toThrow(kind === "identity" ? "PLUGIN_APPLICATION_MANIFEST_ID_MISMATCH" : "PLUGIN_APPLICATION_CANONICAL_SLOT_CHANGED");
});

it("requires the application to render its new Slot rather than assuming npm forwards it", async () => {
  const { root, context } = await fixture(["composer"]); await ensurePluginApplication(root, "composer", context);
  const directory = path.join(context.paths.pluginsRoot, "composer"); const file = path.join(directory, "manifest.json");
  const manifest = JSON.parse(await readFile(file, "utf8"));
  manifest.slots.children.testHint = { description: "Project hint", cardinality: "many", optional: true };
  await writeFile(file, JSON.stringify(manifest));
  const asset = { pluginId: "composer", ownership: "project_source", application: { implementationOwnership: "npm" },
    manifestPath: "src/custom-ui/plugins/composer/manifest.json", definitionPath: "src/custom-ui/plugins/composer/definition.ts", childSlots: manifest.slots.children } as any;
  const before = await verifyPluginChildSlots(root, [asset]);
  expect(before).toEqual(expect.arrayContaining([expect.objectContaining({ code: "plugin-child-slot-declared-not-rendered", slot: "testHint" })]));
  const entry = path.join(directory, "index.tsx");
  await writeFile(entry, 'import {ConversationComposerPlugin as Implementation} from "@za38.03/agent-ui-plugins/composer"; import type {ComponentProps} from "react"; export function ConversationComposerPlugin(props:ComponentProps<typeof Implementation>){return <><Implementation {...props}/>{props.renderSlot("testHint")}</>;}');
  expect(await verifyPluginChildSlots(root, [asset])).toEqual([]);
});

it.each([undefined, "platform", "assistant", "embedded"] as const)("initializes the relative domain hook for mode %s and preserves project customizations", async mode => {
  const { root, context } = await fixture();
  const result = await ensurePluginApplication(root, "conversation-thread-list", { ...context, mode });
  const hook = path.join(context.paths.sourceRoot, "services/hooks/useConversations.ts");
  expect(result.createdPaths).toContain("src/custom-ui/services/hooks/useConversationActions.ts");
  expect(await readFile(path.join(context.paths.sourceRoot, "services/hooks/useConversationActions.ts"), "utf8")).toContain("useRuntimeConversationActions");
  expect(result.createdPaths).toContain("src/custom-ui/services/hooks/useConversations.ts");
  const source = await readFile(hook, "utf8");
  expect(source).toContain('from "../conversations"');
  await expect(readFile(path.join(context.paths.sourceRoot, "hooks/useConversations.ts"))).rejects.toMatchObject({ code: "ENOENT" });
  const application = await readFile(path.join(context.paths.pluginsRoot, "conversation-thread-list/index.tsx"), "utf8");
  expect(application).toContain('from "../../services/hooks/useConversations"');
  expect(application).not.toContain("usePluginService");
  expect(application).toContain('from "../../services/hooks/useConversationActions"');
  const custom = source + "\n// project customization\n";
  await writeFile(hook, custom);
  await ensurePluginApplication(root, "conversation-surface", context);
  await ensurePluginApplication(root, "conversation-thread-list", { ...context, mode }, { repair: true });
  expect(await readFile(hook, "utf8")).toBe(custom);
  expect(await readFile(path.join(context.paths.pluginsRoot, "conversation-thread-list/index.tsx"), "utf8")).toBe(application);
  const lock = await readFile(path.join(root, ".agent-ui/source-lock.json"), "utf8");
  expect(lock).not.toContain("services/hooks/useConversations");
});

it("previews hook creation without writing project files", async () => {
  const { root, context } = await fixture();
  const result = await ensurePluginApplication(root, "conversation-surface", context, { preview: true });
  expect(result.createdPaths).toContain("src/custom-ui/services/hooks/useConversations.ts");
  await expect(readFile(path.join(context.paths.sourceRoot, "services/hooks/useConversations.ts"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("rejects an installed application catalog missing its required domain hook instead of generating direct service consumers", async () => {
  const { root, installed, context } = await fixture();
  const catalogPath = path.join(installed, "dist/catalog.json");
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  catalog.plugins.find((plugin: { id: string }) => plugin.id === "conversation-thread-list").application.sharedFiles = [];
  await writeFile(catalogPath, JSON.stringify(catalog));
  await expect(ensurePluginApplication(root, "conversation-thread-list", context)).rejects.toThrow("PLUGIN_APPLICATION_PACKAGE_API_UNSUPPORTED");
  await expect(readFile(path.join(context.paths.pluginsRoot, "conversation-thread-list/index.tsx"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("reads an existing application without imposing the new template's shared-file paths", async () => {
  const { root, installed, context } = await fixture();
  await ensurePluginApplication(root, "conversation-thread-list", context);
  const application = path.join(context.paths.pluginsRoot, "conversation-thread-list/index.tsx");
  const manifest = path.join(context.paths.pluginsRoot, "conversation-thread-list/manifest.json");
  const before = await readFile(application, "utf8");
  const catalogPath = path.join(installed, "dist/catalog.json");
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  for (const file of catalog.plugins.find((plugin: { id: string }) => plugin.id === "conversation-thread-list").application.sharedFiles) {
    file.target = file.target.replace("services/hooks/", "hooks/");
  }
  await writeFile(catalogPath, JSON.stringify(catalog));
  expect(JSON.parse(await readApplicationCompositionManifest(root, "conversation-thread-list", manifest)).id).toBe("conversation-thread-list");
  expect(await ensurePluginApplication(root, "conversation-thread-list", context)).toEqual({ changed: false, createdPaths: [] });
  expect(await readFile(application, "utf8")).toBe(before);
  await expect(ensurePluginApplication(root, "conversation-thread-list", context, { repair: true })).rejects.toThrow("PLUGIN_APPLICATION_PACKAGE_API_UNSUPPORTED");
});

it.each(["digest", "windows-separator", "escape"])("rejects invalid shared hook %s before mutation", async kind => {
  const { root, installed, context } = await fixture();
  const catalogPath = path.join(installed, "dist/catalog.json");
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const file = catalog.plugins.find((plugin: { id: string }) => plugin.id === "conversation-surface").application.sharedFiles[0];
  if (kind === "digest") file.sha256 = "0".repeat(64);
  if (kind === "windows-separator") file.target = "services\\hooks\\useConversations.ts";
  if (kind === "escape") file.target = "services/hooks/../../../application/Agent.tsx";
  await writeFile(catalogPath, JSON.stringify(catalog));
  await expect(ensurePluginApplication(root, "conversation-surface", context)).rejects.toThrow();
  await expect(readFile(path.join(context.paths.pluginsRoot, "conversation-surface/index.tsx"))).rejects.toMatchObject({ code: "ENOENT" });
});


it.each(["auth-account", "auth-gate"])("initializes %s with the shared auth hook and preserves project-owned hook and contract", async id => {
  const { root, context } = await fixture(["auth-account", "auth-gate"]);
  const result = await ensurePluginApplication(root, id, context);
  expect(result.createdPaths).toContain("src/custom-ui/services/hooks/useAuthSession.ts");
  expect(result.createdPaths.every(file => !file.includes("\\"))).toBe(true);
  const hook = path.join(context.paths.sourceRoot, "services/hooks/useAuthSession.ts");
  const contract = path.join(context.paths.sourceRoot, "services/auth/session.ts");
  const application = path.join(context.paths.pluginsRoot, id, "index.tsx");
  expect(await readFile(hook, "utf8")).toContain('from "../auth/session"');
  const source = await readFile(application, "utf8");
  expect(source).toContain('from "../../services/hooks/useAuthSession"');
  expect(source).not.toContain("usePluginService");
  const customHook = (await readFile(hook, "utf8")) + "\n// custom auth hook\n";
  const customContract = (await readFile(contract, "utf8")) + "\n// custom auth contract\n";
  await writeFile(hook, customHook); await writeFile(contract, customContract);
  await ensurePluginApplication(root, id === "auth-account" ? "auth-gate" : "auth-account", context);
  await ensurePluginApplication(root, id, context, { repair: true });
  expect(await readFile(hook, "utf8")).toBe(customHook);
  expect(await readFile(contract, "utf8")).toBe(customContract);
  expect(await readFile(application, "utf8")).toBe(source);
  expect(await readFile(context.paths.sourceLockPath, "utf8")).not.toContain("services/hooks/useAuthSession");
});
