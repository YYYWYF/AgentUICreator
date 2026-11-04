import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { initializeAgentUIProject } from "../src/bootstrap/initialize-agent-ui-project";
import { collectAppUIPluginLocations, parseAppUIModelJson } from "../src/framework/contracts/app-ui-model";
import { writeGeneratedPluginRegistry } from "../src/generate-plugin-registry";
import { mutateAppUIModel } from "../src/project/app-ui-transaction";
import { createAgentUIInitializationHost } from "../src/project/bootstrap-host";
import { installDemoPlugin } from "../src/project/install-demo-plugin";
import { installOfficialAgentUIResource } from "../src/project/install-official-agent-ui-resource";
import { inspectOfficialAgentUIResourceCatalog } from "../src/project/official-resource-inspection";
import { resourcePaths } from "../src/project/optional-resource-paths";
import { ensurePluginApplication } from "../src/project/plugin-application";
import { verifyUIProject } from "../src/verify-ui";
import { repositoryRoot } from "./support/generated-project";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function fixture(mode: "platform" | "assistant" | "embedded") {
  const root = await mkdtemp(path.join(tmpdir(), "feedback installation 空间-"));
  roots.push(root);
  const host = path.join(repositoryRoot, "examples/creator-host-sandbox");
  await writeFile(path.join(root, "package.json"), await readFile(path.join(host, "package.json")));
  await symlink(path.join(host, "node_modules"), path.join(root, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  await initializeAgentUIProject({ projectRoot: root, mode, sourceRoot: "agent-ui" }, createAgentUIInitializationHost());
  const { paths } = await resourcePaths(root);
  return { root, paths, readModel: async () => parseAppUIModelJson(await readFile(paths.appUIModelPath, "utf8")) };
}

it.each(["platform", "assistant", "embedded"] as const)(
  "%s installs feedback alongside existing actions and re-enables it without replacing siblings or creating duplicates",
  async mode => {
    const { root, paths, readModel } = await fixture(mode);
    const original = await readModel();
    const footer = collectAppUIPluginLocations(original).find(({ plugin }) => plugin.pluginId === "response-footer")!.plugin;
    const actions = structuredClone(footer.slots!.actions!);
    expect(actions.some(plugin => plugin.pluginId === "copy-action")).toBe(true);
    const sourceLock = await readFile(paths.sourceLockPath);
    const runPackages = async () => { throw new Error("Existing test dependencies must be reused"); };

    expect(await installOfficialAgentUIResource(root, "message-feedback", { runPackages }))
      .toMatchObject({ changed: true, verification: { status: "passed" } });
    const installed = await readModel();
    const locations = collectAppUIPluginLocations(installed);
    const feedback = locations.filter(({ plugin }) => plugin.pluginId === "feedback-actions");
    expect(feedback).toHaveLength(1);
    expect(feedback[0]!.target).toEqual({ type: "plugin_slot", parentInstanceId: footer.id, slot: "actions" });
    const installedFooter = locations.find(({ plugin }) => plugin.id === footer.id)!.plugin;
    expect(installedFooter.slots!.actions!.filter(plugin => plugin.pluginId !== "feedback-actions")).toEqual(actions);
    expect(installedFooter.slots!.actions!.at(-1)!.id).toBe(feedback[0]!.plugin.id);
    const application = await readFile(path.join(paths.pluginsRoot, "feedback-actions/index.tsx"));
    const installedSource = await readFile(paths.appUIModelPath, "utf8");
    expect(await installOfficialAgentUIResource(root, "message-feedback", { runPackages })).toMatchObject({ changed: false });
    expect(await readFile(paths.appUIModelPath, "utf8")).toBe(installedSource);

    await mutateAppUIModel(root, {
      appUIModelHash: createHash("sha256").update(installedSource).digest("hex"),
      operations: [{ type: "set_plugin_enabled", instanceId: feedback[0]!.plugin.id, enabled: false }],
    });
    expect((await inspectOfficialAgentUIResourceCatalog(root)).find(resource => resource.id === "message-feedback")?.status).toBe("disabled");
    expect(await installOfficialAgentUIResource(root, "message-feedback", { runPackages }))
      .toMatchObject({ changed: true, reenabled: true, verification: { status: "passed" } });
    expect(await readModel()).toEqual(installed);
    expect((await inspectOfficialAgentUIResourceCatalog(root)).find(resource => resource.id === "message-feedback")?.status).toBe("ready");
    expect(await readFile(paths.sourceLockPath)).toEqual(sourceLock);
    expect(await readFile(path.join(paths.pluginsRoot, "feedback-actions/index.tsx"))).toEqual(application);
  },
  120_000,
);

it("still rejects a different contribution in a singleton Slot without changing the model", async () => {
  const { root, paths, readModel } = await fixture("assistant");
  await ensurePluginApplication(root, "tool-fallback");
  const model = await readModel();
  const tool = collectAppUIPluginLocations(model).find(({ plugin }) => plugin.pluginId === "tool-result")!.plugin;
  tool.pluginId = "tool-fallback";
  await writeFile(paths.appUIModelPath, JSON.stringify(model, null, 2) + "\n");
  await writeGeneratedPluginRegistry(root);
  expect((await verifyUIProject(root)).status).toBe("passed");
  const before = await readFile(paths.appUIModelPath);
  await expect(installDemoPlugin(root, "tool-result")).rejects.toMatchObject({
    code: "RESOURCE_CONFLICT", technicalDetails: { code: "PLUGIN_SLOT_OCCUPIED", slot: "toolFallback", occupantPluginId: "tool-fallback" },
  });
  expect(await readFile(paths.appUIModelPath)).toEqual(before);
}, 120_000);
