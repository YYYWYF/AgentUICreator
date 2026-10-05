import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { generatedProjectFixture } from "../support/generated-project";
import { installOfficialAgentUIResource } from "../../src/project/install-official-agent-ui-resource";
import { collectAppUIPluginLocations, parseAppUIModelJson } from "../../src/framework/contracts/app-ui-model";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function project() {
  const root = await mkdtemp(path.join(tmpdir(), "conversation-quote-resource-"));
  roots.push(root);
  await cp(await generatedProjectFixture(), root, { recursive: true });
  return root;
}
const modelPath = (root: string) => path.join(root, "agent-ui/app-ui/app-ui.json");
async function locations(root: string) {
  return collectAppUIPluginLocations(parseAppUIModelJson(await readFile(modelPath(root), "utf8")));
}
async function expectComposerPlacement(root: string) {
  const entries = await locations(root);
  const quotes = entries.filter(({ plugin }) => plugin.pluginId === "conversation-quote");
  const composer = entries.find(({ plugin }) => plugin.pluginId === "assistant-ui-composer")!;
  expect(composer.plugin.id).toBe("assistant-ui-composer-main");
  expect(quotes).toHaveLength(1);
  expect(quotes[0]!.target).toEqual({ type: "plugin_slot", parentInstanceId: composer.plugin.id, slot: "beforeInput" });
  expect(quotes[0]!.plugin.enabled).toBe(true);
}
it("freshly installs the Quote Resource under the manifest's composer slot", async () => {
  const root = await project();
  expect((await locations(root)).some(({ plugin }) => plugin.pluginId === "conversation-quote")).toBe(false);
  await rm(path.join(root, "agent-ui/plugins/conversation-quote"), { recursive: true, force: true });
  await installOfficialAgentUIResource(root, "conversation-quote");
  await expectComposerPlacement(root);
});
it("keeps the model unchanged on idempotent Quote Resource reinstall", async () => {
  const root = await project();
  await installOfficialAgentUIResource(root, "conversation-quote");
  const before = await readFile(modelPath(root), "utf8");
  await installOfficialAgentUIResource(root, "conversation-quote");
  expect(await readFile(modelPath(root), "utf8")).toBe(before);
  await expectComposerPlacement(root);
});
it("restores an existing Quote Resource from application scope to the composer", async () => {
  const root = await project();
  const model = parseAppUIModelJson(await readFile(modelPath(root), "utf8"));
  model.applicationPlugins ??= [];
  model.applicationPlugins.push({ id: "misplaced-quote", pluginId: "conversation-quote", enabled: true });
  await writeFile(modelPath(root), JSON.stringify(model));
  await installOfficialAgentUIResource(root, "conversation-quote");
  await expectComposerPlacement(root);
  expect((await locations(root)).find(({ plugin }) => plugin.pluginId === "conversation-quote")!.plugin.id).toBe("misplaced-quote");
});
