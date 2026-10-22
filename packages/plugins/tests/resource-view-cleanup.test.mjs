// @vitest-environment node
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { cleanGeneratedPluginResourceViews, materializePluginSources, readSourceLayout, sourcePath } from "../scripts/materialize-plugin-sources.mjs";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const view = "resources/registry/items/plugin/sample/files/plugins/sample/index.tsx";
const owner = "src/plugins/sample/adapters/project/index.tsx";
const files = [{ source: owner, view, kind: "project", pluginId: "sample" }];
const legacy = "resources/registry/items/plugin-retired";

async function fixture(task) {
  const root = await mkdtemp(path.join(tmpdir(), "plugin cleanup 中文 "));
  const put = async (logical, text = "generated\r\n") => {
    const target = sourcePath(root, logical);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, text);
  };
  try {
    await put("source-layout.json", JSON.stringify({ schemaVersion: 1, files }));
    await put(owner);
    await task(root, put);
  } finally { await rm(root, { recursive: true, force: true }); }
}

it("cleans retired flat views and current generated views, preserving canonical and unrelated files", async () => {
  await fixture(async (root, put) => {
    for (const logical of [view, `${legacy}/files/services/auth/adapter.ts`, `${legacy}/changelog.json`]) await put(logical);
    const preserved = [owner, "resources/registry/items/plugin/sample/item.json", "resources/registry/items/foundation/core/files/index.ts", "resources/registry/items/plugin-not-generated.txt"];
    for (const logical of preserved) await put(logical, "keep\r\n");
    await cleanGeneratedPluginResourceViews(root);
    await expect(readFile(sourcePath(root, view))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readdir(sourcePath(root, legacy))).rejects.toMatchObject({ code: "ENOENT" });
    for (const logical of preserved) expect(await readFile(sourcePath(root, logical), "utf8")).toBe("keep\r\n");
    await cleanGeneratedPluginResourceViews(root);
  });
});

it("preserves non-generated files and directory links in the legacy namespace", async () => {
  await fixture(async (root, put) => {
    await put(`${legacy}/files/index.ts`);
    await put(`${legacy}/item.json`, "descriptor");
    await put("outside/files/index.ts", "external");
    await symlink(sourcePath(root, "outside"), sourcePath(root, "resources/registry/items/plugin-linked"), process.platform === "win32" ? "junction" : "dir");
    await cleanGeneratedPluginResourceViews(root);
    expect(await readFile(sourcePath(root, `${legacy}/item.json`), "utf8")).toBe("descriptor");
    expect(await readFile(sourcePath(root, "outside/files/index.ts"), "utf8")).toBe("external");
    await expect(readFile(sourcePath(root, `${legacy}/files/index.ts`))).rejects.toMatchObject({ code: "ENOENT" });
  });
});

it("cleans legacy views before generation, only materializes current paths on request, and cleans afterward", async () => {
  await fixture(async (root, put) => {
    await put(`${legacy}/changelog.json`);
    await materializePluginSources(root);
    await expect(readdir(sourcePath(root, legacy))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(sourcePath(root, view))).rejects.toMatchObject({ code: "ENOENT" });
    await materializePluginSources(root, { resourceViews: true });
    expect(await readFile(sourcePath(root, view), "utf8")).toBe("generated\r\n");
    expect(await readdir(sourcePath(root, "resources/registry/items"))).toEqual(["plugin"]);
    await cleanGeneratedPluginResourceViews(root);
    await expect(readFile(sourcePath(root, view))).rejects.toMatchObject({ code: "ENOENT" });
  });
});

it("handles an absent resource tree and rejects obsolete mappings before generating files", async () => {
  await fixture(async (root, put) => {
    await cleanGeneratedPluginResourceViews(root);
    await put("source-layout.json", JSON.stringify({ schemaVersion: 1, files: [{ ...files[0], view: `${legacy}/files/index.ts` }] }));
    await expect(materializePluginSources(root, { resourceViews: true })).rejects.toThrow("Obsolete plugin resource view");
    await expect(readdir(sourcePath(root, legacy))).rejects.toMatchObject({ code: "ENOENT" });
  });
});

it("keeps logical path checks independent of Windows drive and UNC filesystem paths", async () => {
  for (const nativeRoot of ["C:\\Agent UI 中文", "\\\\server\\share\\Agent UI 中文"]) {
    const windowsPath = path.win32.join(nativeRoot, ...view.split("/"));
    expect(path.win32.relative(nativeRoot, windowsPath).replaceAll("\\", "/")).toBe(view);
  }
  await fixture(async (root, put) => {
    await put("source-layout.json", JSON.stringify({ schemaVersion: 1, files: [{ ...files[0], view: view.replaceAll("/", "\\") }] }));
    await expect(readSourceLayout(root)).rejects.toThrow("Unsafe plugin source path");
  });
});

it("keeps checked-in generation mappings and registry manifests out of the flat namespace", async () => {
  await readSourceLayout(packageRoot);
  const registry = JSON.parse(await readFile(path.join(packageRoot, "resources/registry/registry.json"), "utf8"));
  for (const item of registry.items) expect(item.path).not.toMatch(/^items\/plugin-/u);
});
