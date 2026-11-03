import { expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { cssAssetImport } from "../scripts/ui-assets.mjs";
import { buildPublicDeclarationGraph } from "../scripts/declaration-graph.mjs";

it("emits logical CSS imports for Windows drive paths with spaces and Unicode", () => {
  const native = path.win32.relative("C:\\Agent UI\\dist\\ui", "C:\\Agent UI\\dist\\ui\\runtime\\界面\\panel.css");
  expect(cssAssetImport(native)).toBe('@import "./runtime/界面/panel.css";');
});
it("retains subpath-only declarations and reports missing subpath dependencies", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ui declarations 中文 "));
  try {
    await mkdir(path.join(root, "ui"));
    await writeFile(path.join(root, "index.d.ts"), "export {};\n");
    await writeFile(path.join(root, "ui/index.d.ts"), "export {};\n");
    await writeFile(path.join(root, "ui/feature.d.ts"), 'export type { Shared } from "../shared.js";\n');
    await writeFile(path.join(root, "shared.d.ts"), "export interface Shared { id: string }\n");
    const graph = await buildPublicDeclarationGraph(root);
    expect(graph.missing).toEqual([]);
    expect(graph.reachable.has(path.join(root, "shared.d.ts"))).toBe(true);
    await rm(path.join(root, "shared.d.ts"));
    expect((await buildPublicDeclarationGraph(root)).missing).toContainEqual({ sourcePath: path.join(root, "ui/feature.d.ts"), specifier: "../shared.js" });
  } finally { await rm(root, { recursive: true, force: true }); }
});
