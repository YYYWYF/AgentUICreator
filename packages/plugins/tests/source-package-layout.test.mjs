import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { sourcePath, materializePluginSources, capturePresentationSources } from "../scripts/materialize-plugin-sources.mjs";
import { deliveries, portableSource, sourceEntries } from "../scripts/plugin-source-recipes.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const sha256 = value => createHash("sha256").update(value).digest("hex");

it('publishes skills as an opt-in UI plugin without enabling it in any initialization preset', async () => {
  const catalog = JSON.parse(await readFile(path.join(root, 'dist/catalog.json'), 'utf8'));
  const skills = catalog.plugins.find(plugin => plugin.id === 'skills');
  const selection = catalog.plugins.find(plugin => plugin.id === 'skills-selection');
  expect(skills.application.component).toBe('SkillsPlugin');
  expect(skills.application.services.provides).toContain('conversation.skills');
  expect(selection.application.component).toBe('SkillsSelectionPlugin');
  expect(skills.takeover.requiredDependencies).toHaveProperty('@base-ui/react');
  expect(skills.takeover.requiredDependencies).toHaveProperty('lucide-react');
  for (const mode of ['platform', 'assistant', 'embedded']) {
    const presetPath = path.join(root, '../creator/operator/presets', mode, 'app-ui.json');
    let model = JSON.parse(await readFile(presetPath, 'utf8'));
    if (model.$ref) model = JSON.parse(await readFile(path.resolve(path.dirname(presetPath), model.$ref), 'utf8'));
    expect(JSON.stringify(model)).not.toContain('"pluginId":"skills"');
    expect(JSON.stringify(model)).not.toContain('"pluginId":"skills-selection"');
  }
});

// This exhaustive extraction formats every published Plugin source, rather than
// exercising one unit. Use the same budget as installed-package integration cases.
it("extracts every official Plugin against the public contract without a copied framework", async () => {
  for (const delivery of deliveries) for (const [target, origin] of sourceEntries(delivery)) {
    const source = await readFile(path.join(root, ...origin.split("/")), "utf8");
    const portable = await portableSource(delivery, target, source);
    expect(portable, `${delivery.id}/${target}`).not.toMatch(/from\s+["']\.\.\/\.\.\/framework\/contracts\/ui-plugin["']/u);
    if (/["']\.\.\/\.\.\/framework\/contracts\/ui-plugin["']/u.test(source)) expect(portable).toContain("'@za38.03/agent-ui-plugins/contracts'");
  }
}, 120_000);

it("ships exact canonical plugin and shared source bytes with its own package version", async () => {
  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const catalog = JSON.parse(await readFile(path.join(root, "dist/catalog.json"), "utf8"));
  expect(catalog.package).toEqual({ name: pkg.name, version: pkg.version });
  expect(catalog.plugins.some(plugin => plugin.id === "composer")).toBe(true);
  expect(catalog.plugins.some(plugin => plugin.id === "reasoning")).toBe(true);
  const deliveries = JSON.parse(await readFile(path.join(root, "src/catalog/plugin-delivery.json"), "utf8"));
  const ids = deliveries.map(plugin => plugin.id).sort();
  expect(ids).toHaveLength(48);
  expect(ids).toContain('skills');
  expect(ids).toContain('skills-selection');
  expect(ids).not.toContain("conversation-history");
  expect(pkg.exports).not.toHaveProperty("./conversation-history");
  expect(catalog.plugins.map(plugin => plugin.id).sort()).toEqual(ids);
  expect(ids.every(id => !id.startsWith("assistant-ui-") && id !== "message-footer")).toBe(true);
  expect(Object.keys(pkg.exports).some(key => key.startsWith("./assistant-ui-") || key === "./message-footer")).toBe(false);
  const layout = JSON.parse(await readFile(path.join(root, "source-layout.json"), "utf8"));
  // Upstream ownership is independent from the removed product identities.
  const upstream = layout.files.filter(file => file.kind === "upstream");
  expect(upstream.length).toBeGreaterThan(0);
  expect(upstream.every(file => file.source.startsWith("src/shared/upstream/") || /^src\/plugins\/[^/]+\/upstream\//u.test(file.source))).toBe(true);
  expect(layout.files.every(file => !file.pluginId || ids.includes(file.pluginId))).toBe(true);

  for (const file of [...catalog.plugins.flatMap(plugin => plugin.files), ...catalog.shared]) {
    const published = await readFile(sourcePath(path.join(root, "dist"), file.path));
    const canonical = await readFile(sourcePath(root, file.path.replace(/^sources\//u, "src/")));
    expect(sha256(published), file.path).toBe(file.sha256);
    expect(published.equals(canonical), file.path).toBe(true);
  }
  const registry = JSON.parse(await readFile(path.join(root, "dist/resources/registry/registry.json"), "utf8"));
  expect(registry.items.some(item => item.id === "plugin/conversation-history")).toBe(false);
  expect(await readFile(path.join(root, "dist/public.d.ts"), "utf8")).not.toContain("ConversationHistory");
  for (const stale of ["conversation-history/index.js", "sources/plugins/conversation-history/plugin.json", "sources/takeover/conversation-history/index.tsx"]) {
    await expect(readFile(sourcePath(path.join(root, "dist"), stale))).rejects.toMatchObject({ code: "ENOENT" });
  }
  expect(registry.items.some(item => item.id === "integration/a2ui")).toBe(false);
  await expect(readFile(path.join(root, "dist/resources/history/releases/0.0.1/release.json"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("rejects traversal, drive and UNC logical source paths on every platform", () => {
  for (const value of ["../outside", "/outside", "C:/outside", "C:outside", "C:\\outside", "\\\\host\\share", "a/../b", "a//b", "a\0b"]) {
    expect(() => sourcePath("C:\\Agent UI 中文", value), value).toThrow();
  }
  const logical = "src/plugins/reasoning/upstream/组件.tsx";
  expect(sourcePath(root, logical)).toBe(path.join(root, ...logical.split("/")));
  expect(path.win32.join("C:\\Agent UI 中文", ...logical.split("/"))).toBe("C:\\Agent UI 中文\\src\\plugins\\reasoning\\upstream\\组件.tsx");
});

it("persists reviewed upstream removals instead of resurrecting them on rebuild", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "plugin source 中文 "));
  try {
    const entry = { source: "src/plugins/reasoning/upstream/old.ts", view: "src/internal/vendor-generated/assistant-ui/old.ts", kind: "upstream", pluginId: "reasoning" };
    await mkdir(path.dirname(sourcePath(temporary, entry.source)), { recursive: true });
    await writeFile(sourcePath(temporary, entry.source), "original\r\n");
    await writeFile(path.join(temporary, "source-layout.json"), JSON.stringify({ schemaVersion: 1, files: [entry] }));
    await materializePluginSources(temporary);
    expect(await readFile(sourcePath(temporary, entry.view), "utf8")).toBe("original\r\n");
    await rm(sourcePath(temporary, entry.view));
    await mkdir(path.join(temporary, "src/internal/adapters-generated/assistant-ui"), { recursive: true });
    await capturePresentationSources(temporary);
    await materializePluginSources(temporary);
    await expect(readFile(sourcePath(temporary, entry.view))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(sourcePath(temporary, entry.source))).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await rm(temporary, { recursive: true, force: true }); }
});


it("typechecks every extracted presentation with its declared direct dependencies", async () => {
  const consumer = await mkdtemp(path.join(tmpdir(), "composer public types 中文 "));
  try {
    const require = createRequire(path.join(root,"package.json"));
    const junction = process.platform === "win32" ? "junction" : "dir";
    for (const directory of ["node_modules/@za38.03", "node_modules/@types", "adapters"]) await mkdir(path.join(consumer,directory),{recursive:true});
    for(const name of ["plugins","runtime","core","renderer"]) await symlink(path.join(root,"..",name),path.join(consumer,`node_modules/@za38.03/agent-ui-${name}`),junction);
    await symlink(path.dirname(require.resolve("react/package.json")),path.join(consumer,"node_modules/react"),junction);
    await symlink(path.dirname(require.resolve("@types/react/package.json")),path.join(consumer,"node_modules/@types/react"),junction);
    const catalog=JSON.parse(await readFile(path.join(root,"dist/catalog.json"),"utf8"));
    const dependencies = new Set(catalog.plugins.flatMap(plugin => Object.keys(plugin.takeover.requiredDependencies)));
    for (const name of [...new Set([...dependencies, "@types/node", "@types/react-dom"])]) {
      const destination = path.join(consumer, "node_modules", ...name.split("/"));
      await mkdir(path.dirname(destination), { recursive: true });
      await symlink(path.join(root, "node_modules", ...name.split("/")), destination, junction);
    }
    const portableFiles=catalog.plugins.find(plugin=>plugin.id==="composer").takeover.files;
    const portableIndex=await readFile(sourcePath(path.join(root,"dist"),portableFiles.find(file=>file.target==="index.tsx").path),"utf8");
    expect(portableIndex).not.toContain("queueLabels");
    expect(portableIndex).not.toMatch(/from ['"]@za38\.03\/agent-ui-plugins['"]/u);
    expect(portableIndex.match(/from ['"]\.\/adapters\/composer['"]/gu)).toHaveLength(1);
    for (const plugin of catalog.plugins) for (const file of plugin.takeover.files) {
      const destination = sourcePath(consumer, `${plugin.id}/${file.target}`);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(sourcePath(path.join(root,"dist"),file.path),destination);
    }
    await writeFile(path.join(consumer,"probe.tsx"), `import type { ConversationCanonicalComposerProps } from "./composer/adapters/composer";
import type { ConversationComposerInputProps, ConversationComposerRootProps, ConversationComposerDropzoneProps } from "@za38.03/agent-ui-plugins/composer-support";
const input: ConversationComposerInputProps = { submitMode: "ctrlEnter" };
const root: ConversationComposerRootProps = { style: { padding: 12 } };
const dropzone: ConversationComposerDropzoneProps = { className: "custom" };
const props: ConversationCanonicalComposerProps = { ...root, inputProps: input, dropzoneProps: dropzone };
void props;
`);
    await writeFile(path.join(consumer, "tsconfig.json"), JSON.stringify({ compilerOptions: { noEmit: true, skipLibCheck: true, strict: true, jsx: "react-jsx", module: "ESNext", moduleResolution: "Bundler", esModuleInterop: true, target: "ES2022", resolveJsonModule: true, types: ["react", "node"] }, include: ["probe.tsx", "*/index.tsx", "*/styles.d.ts", "*/adapters/**/*", "*/presentation/**/*", "*/upstream/**/*"] }));
    execFileSync(process.execPath,[path.join(path.dirname(require.resolve("typescript/package.json")),"bin/tsc"),"-p", "tsconfig.json"],{cwd:consumer,stdio:"inherit"});
  } finally { await rm(consumer,{recursive:true,force:true}); }
});


it("binds takeover integrity to final runtime entries including appended utility styles", async () => {
  const catalog = JSON.parse(await readFile(path.join(root, "dist/catalog.json"), "utf8"));
  for (const plugin of catalog.plugins.filter(plugin => plugin.takeover)) {
    for (const file of plugin.takeover.runtimeFiles) {
      expect(sha256(await readFile(sourcePath(path.join(root, "dist"), file.path))), `${plugin.id}: ${file.path}`).toBe(file.sha256);
    }
  }
  const question = catalog.plugins.find(plugin => plugin.id === "ask-user-question");
  expect(question.takeover.files.some(file => file.target === "adapters/contract.ts")).toBe(true);
  expect(question.application.registration).toEqual({ kind: "tool", name: "ask_user_question" });
});

it("owns each Plugin's presentation closure while preserving upstream bytes and npm Context owners", async () => {
  const catalog = JSON.parse(await readFile(path.join(root, "dist/catalog.json"), "utf8"));
  const forbiddenOwners = /src\/internal\/(?:composer-input-host-context|composer-input-accessory-context|assistant-response-runtime|conversation-transient-messages|task-disclosure-context|tool-renderer-context|quote-thread-root)\.tsx?$/u;
  for (const plugin of catalog.plugins) {
    const files = plugin.takeover.files;
    expect(files.some(file => file.target === "presentation.css"), plugin.id).toBe(true);
    const css = await readFile(sourcePath(path.join(root, "dist"), files.find(file => file.target === "presentation.css").path), "utf8");
    expect(css, plugin.id).not.toMatch(/@(?:tailwind|reference|source)\b/u);
    for (const file of files) {
      expect(file.path.startsWith(`sources/takeover/${plugin.id}/`)).toBe(true);
      expect(file.origin, `${plugin.id}/${file.target}`).not.toMatch(forbiddenOwners);
      const bytes = await readFile(sourcePath(path.join(root, "dist"), file.path));
      expect(sha256(bytes)).toBe(file.sha256);
      if (file.origin.includes("/upstream/")) expect(bytes.equals(await readFile(sourcePath(root, file.origin))), file.origin).toBe(true);
    }
  }
  const button = id => catalog.plugins.find(plugin => plugin.id === id).takeover.files.find(file => file.target.endsWith("/tooltip-icon-button.tsx"));
  const composer = button("composer"), reasoning = button("reasoning");
  expect(composer.path).not.toBe(reasoning.path);
  expect(composer.sha256).toBe(reasoning.sha256);
  const temporary = await mkdtemp(path.join(tmpdir(), "private presentation 中文 "));
  try {
    for (const [id, file] of [["composer", composer], ["reasoning", reasoning]]) {
      await mkdir(path.join(temporary, id), { recursive: true });
      await copyFile(sourcePath(path.join(root, "dist"), file.path), path.join(temporary, id, "button.tsx"));
    }
    await writeFile(path.join(temporary, "composer/button.tsx"), "// Project-owned Composer button\n");
    expect(sha256(await readFile(path.join(temporary, "reasoning/button.tsx")))).toBe(reasoning.sha256);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
