import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  loadAgentUISourceRegistry,
  type LoadedAgentUISourceItem,
  type LoadedAgentUISourceRegistry,
} from "@agent-ui/source-registry";
import {
  applyAgentUISourceItem,
  inspectAgentUISources,
  recoverPendingAgentUISourceTransaction,
} from "../scripts/ui-project/source-registry";
import type { UIProjectControlConfig } from "../scripts/ui-project/types";

const config: UIProjectControlConfig = {
  catalogs: [],
  uiPackages: [],
  agentUI: { sourceRoot: "agent-ui", metadataRoot: ".agent-ui" },
};
const temporaryProjects: string[] = [];

async function createProject(): Promise<string> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "agent-ui-source-project-"));
  temporaryProjects.push(projectRoot);
  await writeFile(
    path.join(projectRoot, "package.json"),
    JSON.stringify({ dependencies: { "@base-ui/react": "1.8.0" } }),
  );
  return projectRoot;
}

function fixtureRegistry(
  version: string,
  files: Array<{ target: string; content: string }>,
): LoadedAgentUISourceRegistry {
  const item: LoadedAgentUISourceItem = {
    schemaVersion: 1,
    id: "primitive/upgrade",
    version,
    kind: "primitive",
    description: "upgrade fixture",
    files: files.map(({ target }) => ({ source: `files/${target}`, target })),
    itemRoot: "/registry/items/upgrade",
    manifestPath: "/registry/items/upgrade/item.json",
    loadedFiles: files.map(({ target, content }) => ({
      source: `files/${target}`,
      target,
      absolutePath: `/registry/items/upgrade/files/${target}`,
      content: Buffer.from(content),
    })),
  };
  return { root: "/registry", items: [item], byId: new Map([[item.id, item]]) };
}

afterEach(async () => {
  await Promise.all(
    temporaryProjects.splice(0).map((projectRoot) =>
      rm(projectRoot, { recursive: true, force: true }),
    ),
  );
});

describe("Agent UI source ownership", () => {
  it("installs dependencies atomically and refuses to overwrite customization", async () => {
    const projectRoot = await createProject();
    const before = await inspectAgentUISources(projectRoot, config);
    expect(before.items.find((item) => item.id === "primitive/dialog")?.status).toBe(
      "not-installed",
    );

    const result = await applyAgentUISourceItem(
      projectRoot,
      { itemId: "primitive/dialog", expectedStateHash: before.stateHash },
      config,
    );
    expect(result.changedItems).toEqual(["foundation/core", "primitive/dialog"]);
    const installed = await inspectAgentUISources(projectRoot, config);
    expect(installed.items.find((item) => item.id === "foundation/core")?.status).toBe(
      "managed",
    );
    expect(installed.items.find((item) => item.id === "primitive/dialog")?.status).toBe(
      "managed",
    );

    const dialogPath = path.join(projectRoot, "agent-ui/primitives/dialog.tsx");
    await writeFile(dialogPath, `${await readFile(dialogPath, "utf8")}\n// customized\n`);
    const customized = await inspectAgentUISources(projectRoot, config);
    expect(customized.items.find((item) => item.id === "primitive/dialog")?.status).toBe(
      "customized",
    );
    await expect(
      applyAgentUISourceItem(
        projectRoot,
        { itemId: "primitive/dialog", expectedStateHash: customized.stateHash },
        config,
      ),
    ).rejects.toMatchObject({ code: "AGENT_UI_SOURCE_CUSTOMIZED" });
    expect(await readFile(dialogPath, "utf8")).toContain("// customized");
  });

  it("preserves an untracked collision byte-for-byte", async () => {
    const projectRoot = await createProject();
    const collisionPath = path.join(projectRoot, "agent-ui/primitives/button.tsx");
    await mkdir(path.dirname(collisionPath), { recursive: true });
    await writeFile(collisionPath, "user-owned\n");
    const inspection = await inspectAgentUISources(projectRoot, config);
    expect(inspection.items.find((item) => item.id === "primitive/button")?.status).toBe(
      "blocked",
    );
    await expect(
      applyAgentUISourceItem(
        projectRoot,
        { itemId: "primitive/button", expectedStateHash: inspection.stateHash },
        config,
      ),
    ).rejects.toMatchObject({ code: "AGENT_UI_SOURCE_PATH_CONFLICT" });
    expect(await readFile(collisionPath, "utf8")).toBe("user-owned\n");
  });

  it("reports a missing managed file as partial and refuses repair", async () => {
    const projectRoot = await createProject();
    const before = await inspectAgentUISources(projectRoot, config);
    await applyAgentUISourceItem(
      projectRoot,
      { itemId: "primitive/button", expectedStateHash: before.stateHash },
      config,
    );
    await unlink(path.join(projectRoot, "agent-ui/primitives/button.tsx"));
    const partial = await inspectAgentUISources(projectRoot, config);
    expect(partial.items.find((item) => item.id === "primitive/button")?.status).toBe(
      "partial",
    );
    await expect(
      applyAgentUISourceItem(
        projectRoot,
        { itemId: "primitive/button", expectedStateHash: partial.stateHash },
        config,
      ),
    ).rejects.toMatchObject({ code: "AGENT_UI_SOURCE_PARTIAL" });
  });

  it("reports missing and incompatible package requirements without installing them", async () => {
    const missingRoot = await mkdtemp(path.join(tmpdir(), "agent-ui-source-package-"));
    temporaryProjects.push(missingRoot);
    await writeFile(path.join(missingRoot, "package.json"), JSON.stringify({ dependencies: {} }));
    const missing = await inspectAgentUISources(missingRoot, config);
    expect(missing.issues).toContainEqual(
      expect.objectContaining({ code: "AGENT_UI_PACKAGE_MISSING", packageName: "@base-ui/react" }),
    );

    await writeFile(
      path.join(missingRoot, "package.json"),
      JSON.stringify({ dependencies: { "@base-ui/react": "2.0.0" } }),
    );
    const incompatible = await inspectAgentUISources(missingRoot, config);
    expect(incompatible.issues).toContainEqual(
      expect.objectContaining({ code: "AGENT_UI_PACKAGE_INCOMPATIBLE" }),
    );
  });

  it("recovers the old source and lock after a simulated crash", async () => {
    const projectRoot = await createProject();
    const registry = await loadAgentUISourceRegistry();
    const inspection = await inspectAgentUISources(projectRoot, config, registry);
    await expect(
      applyAgentUISourceItem(
        projectRoot,
        { itemId: "primitive/button", expectedStateHash: inspection.stateHash },
        config,
        registry,
        { simulateCrashAfterMutation: 1 },
      ),
    ).rejects.toThrow("Simulated Agent UI source transaction crash");
    expect(
      await readFile(path.join(projectRoot, ".agent-ui/source-transaction.json"), "utf8"),
    ).toContain("primitive/button");

    await recoverPendingAgentUISourceTransaction(projectRoot, config);
    await expect(
      readFile(path.join(projectRoot, "agent-ui/foundation/AgentUIRoot.tsx")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      readFile(path.join(projectRoot, ".agent-ui/source-lock.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      readFile(path.join(projectRoot, ".agent-ui/source-transaction.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a stale state hash before writing", async () => {
    const projectRoot = await createProject();
    const inspection = await inspectAgentUISources(projectRoot, config);
    await mkdir(path.join(projectRoot, "agent-ui/primitives"), { recursive: true });
    await writeFile(path.join(projectRoot, "agent-ui/primitives/button.tsx"), "raced\n");
    await expect(
      applyAgentUISourceItem(
        projectRoot,
        { itemId: "primitive/button", expectedStateHash: inspection.stateHash },
        config,
      ),
    ).rejects.toMatchObject({ code: "AGENT_UI_SOURCE_STATE_CONFLICT" });
  });

  it("upgrades only a fully managed item and removes obsolete managed files", async () => {
    const v1 = fixtureRegistry("0.1.0", [
      { target: "primitives/upgrade.ts", content: "v1\n" },
      { target: "primitives/old.css", content: ".old {}\n" },
    ]);
    const v2 = fixtureRegistry("0.2.0", [
      { target: "primitives/upgrade.ts", content: "v2\n" },
      { target: "primitives/new.css", content: ".new {}\n" },
    ]);
    const projectRoot = await createProject();
    const empty = await inspectAgentUISources(projectRoot, config, v1);
    await applyAgentUISourceItem(
      projectRoot,
      { itemId: "primitive/upgrade", expectedStateHash: empty.stateHash },
      config,
      v1,
    );
    const upgradeState = await inspectAgentUISources(projectRoot, config, v2);
    await applyAgentUISourceItem(
      projectRoot,
      { itemId: "primitive/upgrade", expectedStateHash: upgradeState.stateHash },
      config,
      v2,
    );
    expect(await readFile(path.join(projectRoot, "agent-ui/primitives/upgrade.ts"), "utf8")).toBe(
      "v2\n",
    );
    expect(await readFile(path.join(projectRoot, "agent-ui/primitives/new.css"), "utf8")).toBe(
      ".new {}\n",
    );
    await expect(
      readFile(path.join(projectRoot, "agent-ui/primitives/old.css")),
    ).rejects.toMatchObject({ code: "ENOENT" });

    const customizedRoot = await createProject();
    const customizedEmpty = await inspectAgentUISources(customizedRoot, config, v1);
    await applyAgentUISourceItem(
      customizedRoot,
      { itemId: "primitive/upgrade", expectedStateHash: customizedEmpty.stateHash },
      config,
      v1,
    );
    await writeFile(
      path.join(customizedRoot, "agent-ui/primitives/upgrade.ts"),
      "user version\n",
    );
    const customizedState = await inspectAgentUISources(customizedRoot, config, v2);
    await expect(
      applyAgentUISourceItem(
        customizedRoot,
        { itemId: "primitive/upgrade", expectedStateHash: customizedState.stateHash },
        config,
        v2,
      ),
    ).rejects.toMatchObject({ code: "AGENT_UI_SOURCE_CUSTOMIZED" });
    expect(
      await readFile(path.join(customizedRoot, "agent-ui/primitives/old.css"), "utf8"),
    ).toBe(".old {}\n");
  });
});
