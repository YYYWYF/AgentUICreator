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

async function writeInstalledPackage(
  projectRoot: string,
  packageName: string,
  version: string,
): Promise<void> {
  const packageRoot = path.join(projectRoot, "node_modules", ...packageName.split("/"));
  await mkdir(packageRoot, { recursive: true });
  await writeFile(path.join(packageRoot, "package.json"), JSON.stringify({ name: packageName, version }));
}

async function createProject(
  options: { declared?: string; installed?: string | null } = {},
): Promise<string> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "agent-ui-source-project-"));
  temporaryProjects.push(projectRoot);
  const declared = options.declared ?? "^1.8.0";
  await writeFile(
    path.join(projectRoot, "package.json"),
    JSON.stringify({ dependencies: { "@base-ui/react": declared } }),
  );
  if (options.installed !== null) {
    await writeInstalledPackage(projectRoot, "@base-ui/react", options.installed ?? "1.8.4");
  }
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

function dependencyFixtureRegistry(version: string): LoadedAgentUISourceRegistry {
  const createItem = (
    id: string,
    target: string,
    content: string,
    requires?: string[],
  ): LoadedAgentUISourceItem => ({
    schemaVersion: 1,
    id,
    version,
    kind: id.startsWith("foundation/") ? "foundation" : "primitive",
    description: `${id} fixture`,
    ...(requires === undefined ? {} : { requires }),
    files: [{ source: `files/${target}`, target }],
    itemRoot: `/registry/items/${id.replace("/", "-")}`,
    manifestPath: `/registry/items/${id.replace("/", "-")}/item.json`,
    loadedFiles: [{
      source: `files/${target}`,
      target,
      absolutePath: `/registry/items/${id.replace("/", "-")}/files/${target}`,
      content: Buffer.from(content),
    }],
  });
  const foundation = createItem(
    "foundation/core",
    "foundation/core.ts",
    `export const foundationVersion = "${version}";\n`,
  );
  const dialog = createItem(
    "primitive/dialog",
    "primitives/dialog.ts",
    `export const dialogVersion = "${version}";\n`,
    ["foundation/core"],
  );
  const items = [foundation, dialog];
  return { root: "/registry", items, byId: new Map(items.map((item) => [item.id, item])) };
}

afterEach(async () => {
  await Promise.all(
    temporaryProjects.splice(0).map((projectRoot) =>
      rm(projectRoot, { recursive: true, force: true }),
    ),
  );
});

describe("Agent UI source ownership", () => {
  it("keeps every Source Item installed by the example fully managed", async () => {
    const inspection = await inspectAgentUISources(projectRoot, config);
    const installed = inspection.items.filter((item) => item.installedVersion !== undefined);
    expect(installed.length).toBeGreaterThan(0);
    expect(installed.map((item) => [item.id, item.status])).toEqual(
      installed.map((item) => [item.id, "managed"]),
    );
  });

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

  it.each([
    ["^1.8.0", "1.8.4"],
    ["~1.8.0", "1.8.2"],
    [">=1.8.0 <2", "1.9.0"],
  ])("uses the installed package version for compatibility with declared range %s", async (declared, installed) => {
    const projectRoot = await createProject({ declared, installed });
    const inspection = await inspectAgentUISources(projectRoot, config);
    expect(
      inspection.items.find((item) => item.id === "primitive/dialog")?.requirements,
    ).toContainEqual({
      name: "@base-ui/react",
      required: ">=1.8.0 <2",
      declared,
      installed,
      compatible: true,
    });
  });

  it("scopes package health to installed items and blocks apply on missing packages", async () => {
    const missingRoot = await createProject({ installed: null });
    const missing = await inspectAgentUISources(missingRoot, config);
    expect(missing.issues).not.toContainEqual(
      expect.objectContaining({ code: "AGENT_UI_PACKAGE_MISSING" }),
    );
    expect(
      missing.items.find((item) => item.id === "primitive/dialog")?.requirements,
    ).toContainEqual(expect.objectContaining({
      name: "@base-ui/react",
      declared: "^1.8.0",
      compatible: false,
    }));
    await expect(
      applyAgentUISourceItem(
        missingRoot,
        { itemId: "primitive/dialog", expectedStateHash: missing.stateHash },
        config,
      ),
    ).rejects.toMatchObject({ code: "AGENT_UI_PACKAGE_MISSING" });
    await expect(
      readFile(path.join(missingRoot, ".agent-ui/source-transaction.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      readFile(path.join(missingRoot, ".agent-ui/source-lock.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      readFile(path.join(missingRoot, "agent-ui/primitives/dialog.tsx")),
    ).rejects.toMatchObject({ code: "ENOENT" });

    const installedRoot = await createProject();
    const beforeInstall = await inspectAgentUISources(installedRoot, config);
    await applyAgentUISourceItem(
      installedRoot,
      { itemId: "primitive/dialog", expectedStateHash: beforeInstall.stateHash },
      config,
    );
    await rm(path.join(installedRoot, "node_modules/@base-ui/react"), { recursive: true });
    const unhealthy = await inspectAgentUISources(installedRoot, config);
    expect(unhealthy.issues).toContainEqual(
      expect.objectContaining({ code: "AGENT_UI_PACKAGE_MISSING", packageName: "@base-ui/react" }),
    );
  });

  it("blocks apply when the installed package version is incompatible", async () => {
    const projectRoot = await createProject({ installed: "2.0.0" });
    const inspection = await inspectAgentUISources(projectRoot, config);
    expect(
      inspection.items.find((item) => item.id === "primitive/dialog")?.requirements,
    ).toContainEqual(
      expect.objectContaining({
        name: "@base-ui/react",
        installed: "2.0.0",
        compatible: false,
      }),
    );
    await expect(
      applyAgentUISourceItem(
        projectRoot,
        { itemId: "primitive/dialog", expectedStateHash: inspection.stateHash },
        config,
      ),
    ).rejects.toMatchObject({ code: "AGENT_UI_PACKAGE_INCOMPATIBLE" });
    await expect(
      readFile(path.join(projectRoot, ".agent-ui/source-transaction.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      readFile(path.join(projectRoot, ".agent-ui/source-lock.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      readFile(path.join(projectRoot, "agent-ui/primitives/dialog.tsx")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("blocks an item before transaction when a customized dependency is an older version", async () => {
    const projectRoot = await createProject();
    const v1 = dependencyFixtureRegistry("0.1.0");
    const v2 = dependencyFixtureRegistry("0.2.0");
    const empty = await inspectAgentUISources(projectRoot, config, v1);
    await applyAgentUISourceItem(
      projectRoot,
      { itemId: "primitive/dialog", expectedStateHash: empty.stateHash },
      config,
      v1,
    );
    const dependencyPath = path.join(projectRoot, "agent-ui/foundation/core.ts");
    await writeFile(dependencyPath, "// user-customized foundation\n");
    const requestedPath = path.join(projectRoot, "agent-ui/primitives/dialog.ts");
    const lockPath = path.join(projectRoot, ".agent-ui/source-lock.json");
    const before = {
      dependency: await readFile(dependencyPath, "utf8"),
      requested: await readFile(requestedPath, "utf8"),
      lock: await readFile(lockPath, "utf8"),
    };
    const inspection = await inspectAgentUISources(projectRoot, config, v2);

    await expect(
      applyAgentUISourceItem(
        projectRoot,
        { itemId: "primitive/dialog", expectedStateHash: inspection.stateHash },
        config,
        v2,
      ),
    ).rejects.toMatchObject({
      code: "AGENT_UI_SOURCE_CUSTOMIZED_DEPENDENCY",
      details: {
        requestedItemId: "primitive/dialog",
        dependencyItemId: "foundation/core",
        installedVersion: "0.1.0",
        requiredVersion: "0.2.0",
      },
    });
    expect(await readFile(dependencyPath, "utf8")).toBe(before.dependency);
    expect(await readFile(requestedPath, "utf8")).toBe(before.requested);
    expect(await readFile(lockPath, "utf8")).toBe(before.lock);
    await expect(
      readFile(path.join(projectRoot, ".agent-ui/source-transaction.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps a customized dependency when its installed version matches the Registry", async () => {
    const projectRoot = await createProject();
    const registry = dependencyFixtureRegistry("0.2.0");
    const empty = await inspectAgentUISources(projectRoot, config, registry);
    await applyAgentUISourceItem(
      projectRoot,
      { itemId: "foundation/core", expectedStateHash: empty.stateHash },
      config,
      registry,
    );
    const dependencyPath = path.join(projectRoot, "agent-ui/foundation/core.ts");
    await writeFile(dependencyPath, "// user-customized current foundation\n");
    const customized = await inspectAgentUISources(projectRoot, config, registry);
    const result = await applyAgentUISourceItem(
      projectRoot,
      { itemId: "primitive/dialog", expectedStateHash: customized.stateHash },
      config,
      registry,
    );
    expect(result.changedItems).toEqual(["primitive/dialog"]);
    expect(await readFile(dependencyPath, "utf8")).toBe("// user-customized current foundation\n");
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
