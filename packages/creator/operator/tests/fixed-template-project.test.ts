import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readAgentUIProjectConfig } from "../src/project/project-mode";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function project(items: Record<string, unknown>, sourceRoot = "src/界面") {
  const root = await mkdtemp(path.join(tmpdir(), "fixed template 中文 ")); roots.push(root);
  await mkdir(path.join(root, ".agent-ui"));
  await writeFile(path.join(root, ".agent-ui/project.json"), JSON.stringify({ sourceRoot: "src/界面" }));
  await writeFile(path.join(root, ".agent-ui/source-lock.json"), JSON.stringify({ sourceRoot, items }));
  return root;
}
it.each(["assistant", "embedded", "platform"] as const)("reads %s template provenance without persisting a product mode", async template => {
  const root = await project({ [`foundation/shell-${template}`]: { files: {} } });
  const before = await readFile(path.join(root, ".agent-ui/project.json"), "utf8");
  expect((await readAgentUIProjectConfig(root)).config).toEqual({ sourceRoot: "src/界面", mode: template });
  expect(await readFile(path.join(root, ".agent-ui/project.json"), "utf8")).toBe(before);
});
it("rejects absent, conflicting and mismatched template provenance instead of guessing", async () => {
  for (const [items, sourceRoot] of [
    [{}, "src/界面"],
    [{ "foundation/shell-assistant": {}, "foundation/shell-platform": {} }, "src/界面"],
    [{ "foundation/shell-platform": {} }, "other"],
  ] as const) {
    const root = await project(items, sourceRoot);
    await expect(readAgentUIProjectConfig(root)).rejects.toThrow();
  }
});
it("keeps existing project metadata readable without rewriting it", async () => {
  const root = await project({});
  const source = JSON.stringify({ sourceRoot: "src/界面", mode: "assistant" });
  await writeFile(path.join(root, ".agent-ui/project.json"), source);
  expect((await readAgentUIProjectConfig(root)).config.mode).toBe("assistant");
  expect(await readFile(path.join(root, ".agent-ui/project.json"), "utf8")).toBe(source);
});
