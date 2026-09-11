import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  AgentUISourceRegistryError,
  MAX_AGENT_UI_SOURCE_FILES,
  loadAgentUISourceRegistry,
  parseSourceItem,
} from "../src/index.js";

const temporaryDirectories: string[] = [];

async function registryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "agent-ui-registry-"));
  temporaryDirectories.push(root);
  await mkdir(path.join(root, "items"));
  return root;
}

async function writeItem(
  root: string,
  directory: string,
  item: Record<string, unknown>,
  files: Record<string, string> = { "files/value.ts": "export {};\n" },
): Promise<string> {
  const itemRoot = path.join(root, "items", directory);
  await mkdir(itemRoot, { recursive: true });
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(itemRoot, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
  }
  const manifestPath = `items/${directory}/item.json`;
  await writeFile(path.join(root, manifestPath), JSON.stringify(item));
  return manifestPath;
}

function item(id: string, overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    id,
    version: "0.1.0",
    kind: "primitive",
    description: id,
    files: [{ source: "files/value.ts", target: `${id}.ts` }],
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("Agent UI Source Registry contract", () => {
  it("rejects duplicate item ids and cross-item target ownership", async () => {
    const duplicateRoot = await registryRoot();
    const duplicatePath = await writeItem(duplicateRoot, "one", item("primitive/one"));
    await writeFile(
      path.join(duplicateRoot, "registry.json"),
      JSON.stringify({
        schemaVersion: 1,
        items: [
          { id: "primitive/one", path: duplicatePath },
          { id: "primitive/one", path: duplicatePath },
        ],
      }),
    );
    await expect(loadAgentUISourceRegistry(duplicateRoot)).rejects.toMatchObject({
      code: "AGENT_UI_SOURCE_DUPLICATE_ITEM",
    });

    const conflictRoot = await registryRoot();
    const first = await writeItem(
      conflictRoot,
      "first",
      item("primitive/first", {
        files: [{ source: "files/value.ts", target: "primitives/shared.ts" }],
      }),
    );
    const second = await writeItem(
      conflictRoot,
      "second",
      item("primitive/second", {
        files: [{ source: "files/value.ts", target: "primitives/shared.ts" }],
      }),
    );
    await writeFile(
      path.join(conflictRoot, "registry.json"),
      JSON.stringify({
        schemaVersion: 1,
        items: [
          { id: "primitive/first", path: first },
          { id: "primitive/second", path: second },
        ],
      }),
    );
    await expect(loadAgentUISourceRegistry(conflictRoot)).rejects.toMatchObject({
      code: "AGENT_UI_SOURCE_TARGET_CONFLICT",
    });
  });

  it("rejects missing sources, path escapes, invalid semver, and excessive files", async () => {
    const missingRoot = await registryRoot();
    const manifestPath = await writeItem(
      missingRoot,
      "missing",
      item("primitive/missing", {
        files: [{ source: "files/absent.ts", target: "primitives/missing.ts" }],
      }),
      {},
    );
    await writeFile(
      path.join(missingRoot, "registry.json"),
      JSON.stringify({
        schemaVersion: 1,
        items: [{ id: "primitive/missing", path: manifestPath }],
      }),
    );
    await expect(loadAgentUISourceRegistry(missingRoot)).rejects.toMatchObject({
      code: "AGENT_UI_SOURCE_FILE_NOT_FOUND",
    });

    for (const invalid of [
      item("primitive/escape", {
        files: [{ source: "files/value.ts", target: "../escape.ts" }],
      }),
      item("primitive/version", { version: "latest" }),
      item("primitive/count", {
        files: Array.from({ length: MAX_AGENT_UI_SOURCE_FILES + 1 }, (_, index) => ({
          source: "files/value.ts",
          target: `primitives/${index}.ts`,
        })),
      }),
    ]) {
      expect(() => parseSourceItem(invalid, "item.json")).toThrow(
        AgentUISourceRegistryError,
      );
    }
  });

  it("rejects requirement cycles and oversized source files", async () => {
    const cycleRoot = await registryRoot();
    const first = await writeItem(
      cycleRoot,
      "first",
      item("primitive/first", { requires: ["primitive/second"] }),
    );
    const second = await writeItem(
      cycleRoot,
      "second",
      item("primitive/second", { requires: ["primitive/first"] }),
    );
    await writeFile(
      path.join(cycleRoot, "registry.json"),
      JSON.stringify({
        schemaVersion: 1,
        items: [
          { id: "primitive/first", path: first },
          { id: "primitive/second", path: second },
        ],
      }),
    );
    await expect(loadAgentUISourceRegistry(cycleRoot)).rejects.toMatchObject({
      code: "AGENT_UI_SOURCE_REQUIREMENT_CYCLE",
    });

    const largeRoot = await registryRoot();
    const largePath = await writeItem(
      largeRoot,
      "large",
      item("primitive/large"),
      { "files/value.ts": "x".repeat(256 * 1024 + 1) },
    );
    await writeFile(
      path.join(largeRoot, "registry.json"),
      JSON.stringify({
        schemaVersion: 1,
        items: [{ id: "primitive/large", path: largePath }],
      }),
    );
    await expect(loadAgentUISourceRegistry(largeRoot)).rejects.toMatchObject({
      code: "AGENT_UI_SOURCE_ITEM_LIMIT_EXCEEDED",
    });

    const totalRoot = await registryRoot();
    const totalFiles = Object.fromEntries(
      Array.from({ length: 9 }, (_, index) => [
        `files/${index}.txt`,
        "x".repeat(240 * 1024),
      ]),
    );
    const totalPath = await writeItem(
      totalRoot,
      "total",
      item("primitive/total", {
        files: Object.keys(totalFiles).map((source, index) => ({
          source,
          target: `primitives/${index}.txt`,
        })),
      }),
      totalFiles,
    );
    await writeFile(
      path.join(totalRoot, "registry.json"),
      JSON.stringify({
        schemaVersion: 1,
        items: [{ id: "primitive/total", path: totalPath }],
      }),
    );
    await expect(loadAgentUISourceRegistry(totalRoot)).rejects.toMatchObject({
      code: "AGENT_UI_SOURCE_ITEM_LIMIT_EXCEEDED",
    });
  });

  it("validates optional upstream provenance without changing schemaVersion", () => {
    expect(parseSourceItem(item("primitive/original", {
      upstream: { project: "AgentUICreator", mode: "original" },
    }), "item.json")).toMatchObject({
      schemaVersion: 1,
      upstream: { project: "AgentUICreator", mode: "original" },
    });

    const adapted = {
      project: "shadcn/ui",
      component: "dialog",
      implementation: "base-ui",
      revision: "3ba91b1cc83e1bbe4ab35a422ff2a694849c5048",
      mode: "adapted",
      license: "MIT",
    };
    expect(parseSourceItem(item("primitive/adapted", { upstream: adapted }), "item.json"))
      .toMatchObject({ upstream: adapted });

    for (const upstream of [
      { project: "shadcn/ui", mode: "adapted" },
      { ...adapted, revision: "abc123" },
      { ...adapted, revision: "latest" },
      { ...adapted, revision: "main" },
      { ...adapted, revision: "master" },
    ]) {
      expect(() => parseSourceItem(
        item("primitive/invalid-upstream", { upstream }),
        "item.json",
      )).toThrow(AgentUISourceRegistryError);
    }
  });

  it("requires provenance on every production primitive", async () => {
    const registry = await loadAgentUISourceRegistry();
    const primitives = registry.items.filter((entry) => entry.kind === "primitive");
    expect(primitives).toHaveLength(17);
    for (const primitive of primitives) {
      expect(primitive.upstream, primitive.id).toMatchObject({
        project: expect.any(String),
        mode: expect.stringMatching(/^(adapted|original)$/u),
      });
      if (primitive.upstream?.mode === "adapted") {
        expect(primitive.upstream.component, primitive.id).toBeTruthy();
        expect(primitive.upstream.license, primitive.id).toBeTruthy();
        expect(primitive.upstream.revision, primitive.id).toMatch(/^[a-f0-9]{40}$/u);
      }
    }
  });

  it("registers the Composer as a pinned Agent Component with local dependencies", async () => {
    const registry = await loadAgentUISourceRegistry();
    const composer = registry.byId.get("agent-component/composer");
    expect(composer).toMatchObject({
      version: "0.1.2",
      kind: "agent-component",
      requires: ["foundation/core", "primitive/button", "primitive/textarea"],
      upstream: {
        project: "assistant-ui/assistant-ui",
        component: "elements-composer",
        implementation: "react",
        revision: "3a45a01c0d6141102638ecd4f32d1af4d01fb510",
        mode: "adapted",
        license: "MIT",
      },
    });
    expect(registry.byId.get("agent-component/composer-suggestions")).toMatchObject({
      version: "0.1.0",
      kind: "agent-component",
      requires: ["foundation/core", "primitive/popover"],
      upstream: {
        project: "AgentUICreator",
        mode: "original",
      },
    });
  });

  it("registers Agent Message as an original, foundation-only Agent Component", async () => {
    const registry = await loadAgentUISourceRegistry();
    expect(registry.byId.get("agent-component/message")).toMatchObject({
      version: "0.1.0",
      kind: "agent-component",
      requires: ["foundation/core"],
      upstream: {
        project: "AgentUICreator",
        mode: "original",
      },
    });
  });

  it("registers Agent Attachments and Sources as original, foundation-only Agent Components", async () => {
    const registry = await loadAgentUISourceRegistry();
    for (const id of [
      "agent-component/attachments",
      "agent-component/sources",
    ]) {
      expect(registry.byId.get(id)).toMatchObject({
        version: "0.1.0",
        kind: "agent-component",
        requires: ["foundation/core"],
        upstream: {
          project: "AgentUICreator",
          mode: "original",
        },
      });
    }
  });

  it("registers Agent Conversation List as an original, foundation-only Agent Component", async () => {
    const registry = await loadAgentUISourceRegistry();
    expect(registry.byId.get("agent-component/conversation-list")).toMatchObject({
      version: "0.1.0",
      kind: "agent-component",
      requires: ["foundation/core"],
      upstream: {
        project: "AgentUICreator",
        mode: "original",
      },
    });
  });

  it("registers Agent Reasoning as a pinned assistant-ui adaptation", async () => {
    const registry = await loadAgentUISourceRegistry();
    expect(registry.byId.get("agent-component/reasoning")).toMatchObject({
      version: "0.2.0",
      kind: "agent-component",
      requires: [
        "foundation/core",
        "primitive/collapsible",
      ],
      upstream: {
        project: "assistant-ui/assistant-ui",
        component: "elements-reasoning",
        implementation: "react",
        revision: "97bd4b39fce83163354c9ec8d9d4fb2c9bd1aac7",
        mode: "adapted",
        license: "MIT",
      },
    });
  });

  it("registers Agent Tool as an original Agent Component with owned primitives", async () => {
    const registry = await loadAgentUISourceRegistry();
    expect(registry.byId.get("agent-component/tool")).toMatchObject({
      version: "0.1.0",
      kind: "agent-component",
      requires: [
        "foundation/core",
        "primitive/collapsible",
        "primitive/spinner",
      ],
      upstream: {
        project: "AgentUICreator",
        mode: "original",
      },
    });
  });

  it("registers Agent Tool Activity as an original Agent Component with owned primitives", async () => {
    const registry = await loadAgentUISourceRegistry();
    expect(registry.byId.get("agent-component/tool-activity")).toMatchObject({
      version: "0.1.0",
      kind: "agent-component",
      requires: [
        "foundation/core",
        "primitive/collapsible",
        "primitive/spinner",
      ],
      upstream: {
        project: "AgentUICreator",
        mode: "original",
      },
    });
  });

  it("registers Agent Tool Detail as an original Agent Component", async () => {
    const registry = await loadAgentUISourceRegistry();
    expect(registry.byId.get("agent-component/tool-detail")).toMatchObject({
      version: "0.1.0",
      kind: "agent-component",
      requires: ["foundation/core", "primitive/spinner"],
      upstream: {
        project: "AgentUICreator",
        mode: "original",
      },
    });
  });

  it("registers Agent Thread Welcome as an original, foundation-only Agent Component", async () => {
    const registry = await loadAgentUISourceRegistry();
    expect(registry.byId.get("agent-component/thread-welcome")).toMatchObject({
      version: "0.1.0",
      kind: "agent-component",
      requires: ["foundation/core"],
      upstream: {
        project: "AgentUICreator",
        mode: "original",
      },
    });
  });

  it("registers Agent Suggestions as an original, foundation-only Agent Component", async () => {
    const registry = await loadAgentUISourceRegistry();
    expect(registry.byId.get("agent-component/suggestions")).toMatchObject({
      version: "0.1.0",
      kind: "agent-component",
      requires: ["foundation/core"],
      upstream: {
        project: "AgentUICreator",
        mode: "original",
      },
    });
  });

  it("registers Agent Thread as an original, foundation-only Agent Component", async () => {
    const registry = await loadAgentUISourceRegistry();
    expect(registry.byId.get("agent-component/thread")).toMatchObject({
      version: "0.1.0",
      kind: "agent-component",
      requires: ["foundation/core"],
      upstream: {
        project: "AgentUICreator",
        mode: "original",
      },
    });
  });
});
