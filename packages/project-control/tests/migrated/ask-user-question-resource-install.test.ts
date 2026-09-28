import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { loadAgentUISourceRegistry, resolveAgentUISourceItemClosure, resolveOfficialResource } from "@agent-ui/source-registry";
import { generatedProjectFixture } from "../support/generated-project";
import { installOfficialAgentUIResource } from "../../src/project/install-official-agent-ui-resource";
import { inspectScenarioResources } from "../../src/project/install-scenario-resources";
import { inspectUIComposition } from "../../src/project/project-inspector";
import { inspectOfficialResourceImplementation } from "../../src/project/official-resource-inspection";
import { verifyUIProject } from "../../src/verify-ui";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

it("installs and activates the optional Human Tool in application scope", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ask-user-question-resource-"));
  roots.push(root);
  await cp(await generatedProjectFixture(), root, { recursive: true });
  const registry = await loadAgentUISourceRegistry();
  const closure = resolveAgentUISourceItemClosure(registry, "demo/ask-user-question");
  expect(closure.at(-1)?.id).toBe("demo/ask-user-question");

  await installOfficialAgentUIResource(root, "ask-user-question-demo");
  for (const file of closure.at(-1)!.loadedFiles) {
    expect(await readFile(path.join(root, file.target))).toEqual(file.content);
  }
  const model = JSON.parse(await readFile(path.join(root, "app-ui/app-ui.json"), "utf8"));
  expect(model.applicationPlugins).toEqual(expect.arrayContaining([
    expect.objectContaining({ pluginId: "ask-user-question-demo", enabled: true }),
  ]));
  expect(JSON.stringify(model.root)).not.toContain("ask-user-question-demo");
  expect((await verifyUIProject(root)).status).toBe("passed");
  const inspection = inspectOfficialResourceImplementation(resolveOfficialResource("ask-user-question-demo"),
    await inspectUIComposition(root), await inspectScenarioResources(root));
  expect(inspection.status).toBe("ready");
});
