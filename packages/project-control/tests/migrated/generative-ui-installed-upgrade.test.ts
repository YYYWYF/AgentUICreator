// @vitest-environment node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { DEFAULT_AGENT_UI_SOURCE_REGISTRY_ROOT, loadAgentUISourceRegistry, resolveOfficialResource } from "@agent-ui/source-registry";
import { main as syncGenerativeUi } from "../../../source-registry/scripts/sync-generative-ui-upstream.mjs";
import { generatedProjectFixture } from "../support/generated-project";
import { writeGeneratedConversationIntegrationRegistry } from "../../src/generate-conversation-integration-registry";
import { inspectOfficialResourceImplementation } from "../../src/project/official-resource-inspection";
import { resourcePaths } from "../../src/project/optional-resource-paths";
import { applyAgentUISourceItem } from "../../src/project/source-registry/installer";
import { inspectAgentUISources } from "../../src/project/source-registry/inspector";
import { verifyUIProject } from "../../src/verify-ui";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const digest = (value: Buffer) => createHash("sha256").update(value).digest("hex");

async function put(root: string, relative: string, content: string | Buffer) {
  const filename = path.join(root, relative);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, content);
}

async function item(root: string, directory: string) {
  return JSON.parse(await readFile(path.join(root, "packages/source-registry/registry/items", directory, "item.json"), "utf8"));
}

async function setItem(root: string, directory: string, value: Record<string, unknown>) {
  await put(root, `packages/source-registry/registry/items/${directory}/item.json`, `${JSON.stringify(value, null, 2)}\n`);
}

it("upgrades installed Generative UI dependency source and lock without rewriting A2UI", async () => {
  const registryHost = await mkdtemp(path.join(tmpdir(), "generative-registry-upgrade-"));
  const upstream = await mkdtemp(path.join(tmpdir(), "generative-upstream-upgrade-"));
  const project = await mkdtemp(path.join(tmpdir(), "generative-project-upgrade-"));
  roots.push(registryHost, upstream, project);
  const registryRoot = path.join(registryHost, "packages/source-registry/registry");
  await mkdir(path.dirname(registryRoot), { recursive: true });
  await cp(DEFAULT_AGENT_UI_SOURCE_REGISTRY_ROOT, registryRoot, { recursive: true });
  await cp(await generatedProjectFixture(), project, { recursive: true });

  execFileSync("git", ["-C", upstream, "init", "--quiet"]);
  execFileSync("git", ["-C", upstream, "config", "user.email", "fixture@example.invalid"]);
  execFileSync("git", ["-C", upstream, "config", "user.name", "fixture"]);
  const styled = await readFile(path.join(registryRoot,
    "items/agent-component-assistant-ui-generative-ui/files/agent-ui/vendor/assistant-ui/generative-ui/styled-generative-ui.tsx"), "utf8");
  const release = async (version: string, color: string) => {
    await put(upstream, "packages/react-generative-ui/package.json", JSON.stringify({ name: "@assistant-ui/react-generative-ui", version }));
    await put(upstream, "packages/ui/src/components/react/assistant-ui/elements/generative-ui.tsx", `${styled}\n// release ${version}\n`);
    await put(upstream, "packages/ui/src/lib/generative-ui-vocabulary-css.ts",
      `export const generativeUiVocabularyCss = { '[data-aui="button"]': { color: "${color}" } };\nexport const isDeclarationBlock = (value: Record<string, unknown>) => Object.values(value).every(entry => typeof entry === "string");\n`);
    execFileSync("git", ["-C", upstream, "add", "."]);
    execFileSync("git", ["-C", upstream, "commit", "--quiet", "-m", version]);
    return execFileSync("git", ["-C", upstream, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  };
  const oldRevision = await release("0.0.21", "red");
  const nextRevision = await release("0.0.22", "blue");
  const targetPath = "assistant-ui-upgrade-target.json";
  const target = async (version: string, revision: string) => put(registryHost, targetPath, `${JSON.stringify({
    packages: { "@assistant-ui/react-generative-ui": version }, generativeUiReleaseRevision: revision,
  })}\n`);
  await target("0.0.21", oldRevision);
  await syncGenerativeUi({ root: registryHost, repo: upstream, revision: oldRevision });
  for (const [directory, version] of [["agent-component-assistant-ui-generative-ui", "0.1.0"], ["integration-generative-ui", "0.2.0"]] as const) {
    await setItem(registryHost, directory, { ...await item(registryHost, directory), version });
  }
  const oldRegistry = await loadAgentUISourceRegistry(registryRoot);
  const { config } = await resourcePaths(project);
  const apply = async (registry: typeof oldRegistry) => applyAgentUISourceItem(project, {
    itemId: "integration/a2ui", expectedStateHash: (await inspectAgentUISources(project, config, registry)).stateHash,
  }, config, registry);
  await apply(oldRegistry);
  await writeGeneratedConversationIntegrationRegistry(project);
  const lockPath = path.join(project, config.agentUI.metadataRoot, "source-lock.json");
  const oldLock = JSON.parse(await readFile(lockPath, "utf8"));
  expect(oldLock.items["agent-component/assistant-ui-generative-ui"].version).toBe("0.1.0");
  expect(oldLock.items["integration/generative-ui"].version).toBe("0.2.0");
  expect(oldLock.items["integration/a2ui"].version).toBe("0.2.0");
  const a2uiFiles = oldRegistry.byId.get("integration/a2ui")!.loadedFiles;
  const a2uiBefore = await Promise.all(a2uiFiles.map(file => readFile(path.join(project, file.target))));
  const generatedPath = path.join(project, "agent-ui/conversation/integrations.generated.tsx");
  const generatedBefore = await readFile(generatedPath);
  expect(generatedBefore.toString("utf8")).toContain('from "./integrations/a2ui"');

  await target("0.0.22", nextRevision);
  await syncGenerativeUi({ root: registryHost, repo: upstream, revision: nextRevision });
  const upgradedRegistry = await loadAgentUISourceRegistry(registryRoot);
  expect(upgradedRegistry.byId.get("agent-component/assistant-ui-generative-ui")!.version).toBe("0.1.1");
  expect(upgradedRegistry.byId.get("integration/generative-ui")!.version).toBe("0.2.1");
  expect(upgradedRegistry.byId.get("integration/a2ui")!.version).toBe("0.2.0");

  const manifestPath = path.join(project, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.devDependencies["@assistant-ui/react-generative-ui"] = "0.0.22";
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  const installedPackage = path.join(project, "node_modules/@assistant-ui/react-generative-ui");
  await rm(installedPackage, { recursive: true, force: true });
  await mkdir(installedPackage, { recursive: true });
  await writeFile(path.join(installedPackage, "package.json"), JSON.stringify({ name: "@assistant-ui/react-generative-ui", version: "0.0.22" }));

  const upgraded = await apply(upgradedRegistry);
  expect(upgraded.changedItems).toEqual(expect.arrayContaining([
    "agent-component/assistant-ui-generative-ui", "integration/generative-ui",
  ]));
  expect(upgraded.changedItems).not.toContain("integration/a2ui");
  expect(upgraded.changedPaths.some(changed => a2uiFiles.some(file => changed.endsWith(file.target)))).toBe(false);
  const upgradedLock = JSON.parse(await readFile(lockPath, "utf8"));
  expect(upgradedLock.items["agent-component/assistant-ui-generative-ui"].version).toBe("0.1.1");
  expect(upgradedLock.items["integration/generative-ui"].version).toBe("0.2.1");
  expect(upgradedLock.items["integration/a2ui"]).toEqual(oldLock.items["integration/a2ui"]);
  const changedVendor = upgradedRegistry.byId.get("agent-component/assistant-ui-generative-ui")!.loadedFiles;
  for (const file of changedVendor) {
    const installed = await readFile(path.join(project, file.target));
    expect(installed).toEqual(file.content);
    expect(upgradedLock.items["agent-component/assistant-ui-generative-ui"].files[file.target].sha256).toBe(digest(installed));
  }
  for (const file of upgradedRegistry.byId.get("integration/generative-ui")!.loadedFiles) {
    const installed = await readFile(path.join(project, file.target));
    expect(installed).toEqual(file.content);
    expect(upgradedLock.items["integration/generative-ui"].files[file.target].sha256).toBe(digest(installed));
  }
  for (const [index, file] of a2uiFiles.entries()) expect(await readFile(path.join(project, file.target))).toEqual(a2uiBefore[index]);
  expect(await readFile(generatedPath)).toEqual(generatedBefore);
  expect((await verifyUIProject(project)).status).toBe("passed");
  const sources = await inspectAgentUISources(project, config, upgradedRegistry);
  expect(inspectOfficialResourceImplementation(resolveOfficialResource("a2ui"),
    { pluginSources: [], pluginInstances: [] }, { ...sources, integrationRegistryReady: true }).status).toBe("ready");

  const lockBeforeRepeat = await readFile(lockPath);
  const again = await apply(upgradedRegistry);
  expect(again.changed).toBe(false);
  expect(await readFile(lockPath)).toEqual(lockBeforeRepeat);
  expect(await readFile(generatedPath)).toEqual(generatedBefore);
});
