import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  loadAgentUISourceRegistry,
  type LoadedAgentUISourceItem,
  type LoadedAgentUISourceRegistry,
} from "@agent-ui/source-registry";
import { afterEach, describe, expect, it } from "vitest";

import { applyAgentUISourceItem, inspectAgentUISources } from "../../src/project/source-registry/index";
import { readAgentUISourceLock, sha256 } from "../../src/project/source-registry/lock";
import { uiProjectControlConfig } from "../../src/project/project-config";

const projects: string[] = [];
afterEach(async () => {
  await Promise.all(projects.splice(0).map(project => rm(project, { recursive: true, force: true })));
});

async function projectRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "agent-ui-source-freshness-"));
  projects.push(root);
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "source-freshness-test" }));
  return root;
}

function item(id: string, files: Record<string, string>, requires: string[] = []): LoadedAgentUISourceItem {
  const loadedFiles = Object.entries(files).map(([target, content]) => ({
    source: target,
    target,
    absolutePath: target,
    content: Buffer.from(content),
  }));
  return {
    id,
    version: "0.1.0",
    kind: "foundation",
    description: id,
    requires,
    files: loadedFiles.map(({ source, target }) => ({ source, target })),
    loadedFiles,
    itemRoot: "",
    manifestPath: "",
  };
}

function registry(...items: LoadedAgentUISourceItem[]): LoadedAgentUISourceRegistry {
  return { root: "", items, byId: new Map(items.map(source => [source.id, source])) };
}

async function apply(root: string, sourceRegistry: LoadedAgentUISourceRegistry, itemId: string) {
  const { stateHash } = await inspectAgentUISources(root, uiProjectControlConfig, sourceRegistry);
  return applyAgentUISourceItem(root, { itemId, expectedStateHash: stateHash }, uiProjectControlConfig, sourceRegistry);
}

async function lockedFiles(root: string, itemId: string) {
  const { lock } = await readAgentUISourceLock(root, uiProjectControlConfig);
  return lock.items[itemId]?.files;
}

describe("managed Source freshness uses target set and content hashes", () => {
  it("synchronizes changed content at the same legacy version and updates the lock", async () => {
    const root = await projectRoot();
    const old = registry(item("foundation/example", { "example.ts": "old" }));
    const current = registry(item("foundation/example", { "example.ts": "new" }));
    await apply(root, old, "foundation/example");

    const result = await apply(root, current, "foundation/example");

    expect(result.changed).toBe(true);
    expect(await readFile(path.join(root, "agent-ui/example.ts"), "utf8")).toBe("new");
    expect(await lockedFiles(root, "foundation/example")).toEqual({
      "example.ts": { sha256: sha256("new") },
    });
  });

  it("keeps identical targets and hashes as a no-op at the same version", async () => {
    const root = await projectRoot();
    const sourceRegistry = registry(item("foundation/example", { "example.ts": "unchanged" }));
    await apply(root, sourceRegistry, "foundation/example");

    const result = await apply(root, sourceRegistry, "foundation/example");

    expect(result.changed).toBe(false);
    expect(result.changedPaths).toEqual([]);
  });

  it("rejects a customized dependency when its upstream content changes without a version bump", async () => {
    const root = await projectRoot();
    const old = registry(
      item("foundation/dependency", { "dependency.ts": "baseline" }),
      item("foundation/consumer", { "consumer.ts": "consumer" }, ["foundation/dependency"]),
    );
    await apply(root, old, "foundation/consumer");
    await writeFile(path.join(root, "agent-ui/dependency.ts"), "project customization");
    const current = registry(
      item("foundation/dependency", { "dependency.ts": "new upstream" }),
      item("foundation/consumer", { "consumer.ts": "consumer" }, ["foundation/dependency"]),
    );

    await expect(apply(root, current, "foundation/consumer")).rejects.toMatchObject({
      code: "AGENT_UI_SOURCE_CUSTOMIZED_DEPENDENCY",
    });
    expect(await readFile(path.join(root, "agent-ui/dependency.ts"), "utf8")).toBe("project customization");
  });

  it("preserves a customized dependency when its locked upstream source is unchanged", async () => {
    const root = await projectRoot();
    const sourceRegistry = registry(
      item("foundation/dependency", { "dependency.ts": "baseline" }),
      item("foundation/consumer", { "consumer.ts": "consumer" }, ["foundation/dependency"]),
    );
    await apply(root, sourceRegistry, "foundation/consumer");
    await writeFile(path.join(root, "agent-ui/dependency.ts"), "project customization");

    const result = await apply(root, sourceRegistry, "foundation/consumer");

    expect(result.changed).toBe(false);
    expect(await readFile(path.join(root, "agent-ui/dependency.ts"), "utf8")).toBe("project customization");
  });

  it("adds and removes managed targets at the same version", async () => {
    const root = await projectRoot();
    const old = registry(item("foundation/example", { "keep.ts": "keep", "remove.ts": "remove" }));
    const current = registry(item("foundation/example", { "keep.ts": "keep", "add.ts": "add" }));
    await apply(root, old, "foundation/example");

    const result = await apply(root, current, "foundation/example");

    expect(result.changed).toBe(true);
    expect(result.changedPaths).toContain("agent-ui/add.ts");
    expect(result.changedPaths).toContain("agent-ui/remove.ts");
    await expect(readFile(path.join(root, "agent-ui/remove.ts"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(path.join(root, "agent-ui/add.ts"), "utf8")).toBe("add");
    await expect(lockedFiles(root, "foundation/example")).resolves.toEqual({
      "add.ts": { sha256: sha256("add") },
      "keep.ts": { sha256: sha256("keep") },
    });
  });

  it("synchronizes Run Resume seams into previously managed foundation sources", async () => {
    const root = await projectRoot();
    const loaded = await loadAgentUISourceRegistry();
    const ids = ["foundation/core", "foundation/core-adapters"];
    const currentItems = ids.map(id => {
      const source = loaded.byId.get(id);
      if (!source) throw new Error(`Missing ${id}`);
      return { ...source, requires: [], packages: {} };
    });
    const previousItems = currentItems.map(source => ({
      ...source,
      loadedFiles: source.loadedFiles.map(file => {
        if (file.target === "application/Agent.tsx" ||
            file.target === "agent-ui/conversation/threads/conversation-service-thread-binding.ts") {
          return { ...file, content: Buffer.from("// previously managed source\n") };
        }
        return file;
      }),
    }));
    const previous = registry(...previousItems);
    const current = registry(...currentItems);
    for (const id of ids) await apply(root, previous, id);

    for (const id of ids) expect((await apply(root, current, id)).changed).toBe(true);

    const agent = await readFile(path.join(root, "agent-ui/application/Agent.tsx"), "utf8");
    const binding = await readFile(path.join(root,
      "agent-ui/agent-ui/conversation/threads/conversation-service-thread-binding.ts"), "utf8");
    expect(agent).toContain("initialThreadId");
    expect(agent).toContain("runResumeProvider");
    expect(binding).toContain("resumeProvider");
    for (const source of currentItems) {
      const files = await lockedFiles(root, source.id);
      expect(files).toEqual(Object.fromEntries(source.loadedFiles.map(file => [
        file.target, { sha256: sha256(file.content) },
      ])));
    }
  });
});
