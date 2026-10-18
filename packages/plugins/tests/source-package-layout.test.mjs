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

const root = fileURLToPath(new URL("../", import.meta.url));
const sha256 = value => createHash("sha256").update(value).digest("hex");

it("ships exact canonical plugin and shared source bytes with its own package version", async () => {
  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const catalog = JSON.parse(await readFile(path.join(root, "dist/catalog.json"), "utf8"));
  expect(catalog.package).toEqual({ name: pkg.name, version: pkg.version });
  expect(catalog.plugins.some(plugin => plugin.id === "composer")).toBe(true);
  expect(catalog.plugins.some(plugin => plugin.id === "reasoning")).toBe(true);
  const deliveries = JSON.parse(await readFile(path.join(root, "src/catalog/plugin-delivery.json"), "utf8"));
  const ids = deliveries.map(plugin => plugin.id).sort();
  expect(ids).toHaveLength(43);
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


it("typechecks the published portable Composer adapter with its support declarations", async () => {
  const consumer = await mkdtemp(path.join(tmpdir(), "composer public types 中文 "));
  try {
    const require = createRequire(path.join(root,"package.json"));
    const junction = process.platform === "win32" ? "junction" : "dir";
    for (const directory of ["node_modules/@za38.03", "node_modules/@types", "adapters"]) await mkdir(path.join(consumer,directory),{recursive:true});
    await symlink(root,path.join(consumer,"node_modules/@za38.03/agent-ui-plugins"),junction);
    await symlink(path.dirname(require.resolve("react/package.json")),path.join(consumer,"node_modules/react"),junction);
    await symlink(path.dirname(require.resolve("@types/react/package.json")),path.join(consumer,"node_modules/@types/react"),junction);
    const catalog=JSON.parse(await readFile(path.join(root,"dist/catalog.json"),"utf8"));
    const portableFiles=catalog.plugins.find(plugin=>plugin.id==="composer").takeover.files;
    const portableIndex=await readFile(sourcePath(path.join(root,"dist"),portableFiles.find(file=>file.target==="index.tsx").path),"utf8");
    expect(portableIndex).not.toContain('from "@za38.03/agent-ui-plugins"');
    expect(portableIndex.match(/from "\.\/adapters\/composer"/gu)).toHaveLength(2);
    for(const file of portableFiles.filter(file=>file.target.startsWith("adapters/"))) {
      await copyFile(sourcePath(path.join(root,"dist"),file.path),sourcePath(consumer,file.target));
    }
    await writeFile(path.join(consumer,"probe.tsx"), `import type { ConversationCanonicalComposerProps } from "./adapters/composer";
import type { ConversationComposerInputProps, ConversationComposerRootProps, ConversationComposerDropzoneProps } from "@za38.03/agent-ui-plugins/composer-support";
const input: ConversationComposerInputProps = { submitMode: "ctrlEnter" };
const root: ConversationComposerRootProps = { style: { padding: 12 } };
const dropzone: ConversationComposerDropzoneProps = { className: "custom" };
const props: ConversationCanonicalComposerProps = { inputProps: input, rootProps: root, dropzoneProps: dropzone };
void props;
`);
    execFileSync(process.execPath,[path.join(path.dirname(require.resolve("typescript/package.json")),"bin/tsc"),"--noEmit","--skipLibCheck","--strict","--jsx","react-jsx","--module","ESNext","--moduleResolution","Bundler","--esModuleInterop","--target","ES2022","probe.tsx"],{cwd:consumer,stdio:"pipe"});
  } finally { await rm(consumer,{recursive:true,force:true}); }
});
