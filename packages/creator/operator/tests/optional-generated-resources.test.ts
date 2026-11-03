import { mkdtemp, mkdir, readFile, rm, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import { writeGeneratedFrontendToolRegistries } from "../src/generate-frontend-tool-registry";
import { inspectScenarioResources } from "../src/project/install-scenario-resources";
import { writeGeneratedConversationIntegrationRegistry } from "../src/generate-conversation-integration-registry";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "optional outputs 中文 ")); roots.push(root);
  await mkdir(path.join(root, ".agent-ui"));
  await mkdir(path.join(root, "src/agent-ui"), { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify({ private: true, type: "module" }));
  await writeFile(path.join(root, ".agent-ui/project.json"), JSON.stringify({ mode: "platform", sourceRoot: "src/agent-ui" }));
  return root;
}
it("creates no placeholder source when no optional resource is installed", async () => {
  const root = await fixture();
  expect((await writeGeneratedFrontendToolRegistries(root)).changedPaths).toEqual([]);
  expect((await writeGeneratedConversationIntegrationRegistry(root)).changedPaths).toEqual([]);
  expect((await inspectScenarioResources(root)).integrationRegistryReady).toBe(true);
  for (const directory of ["agent-contract", "agent-ui"]) {
    await expect(access(path.join(root, "src/agent-ui", directory))).rejects.toMatchObject({ code: "ENOENT" });
  }
});
it("wires installed resources and retires their imports after the last removal", async () => {
  const root = await fixture();
  const source = path.join(root, "src/agent-ui");
  const files = {
    "agent-contract/frontend-tools/business.ts": "export const frontendTools = [] as const;\n",
    "agent-ui/conversation/frontend-tool-uis/business.tsx": "export const frontendToolUIs = {};\n",
    "agent-ui/conversation/integrations/business.tsx": "export function ConversationIntegration({ children }: { children: unknown }) { return children; }\n",
  };
  for (const [name, contents] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(source, name)), { recursive: true });
    await writeFile(path.join(source, name), contents);
  }
  expect((await inspectScenarioResources(root)).integrationRegistryReady).toBe(false);
  expect((await writeGeneratedFrontendToolRegistries(root)).changedPaths).toHaveLength(2);
  expect((await writeGeneratedConversationIntegrationRegistry(root)).changedPaths).toHaveLength(1);
  expect((await inspectScenarioResources(root)).integrationRegistryReady).toBe(true);
  expect(await readFile(path.join(source, "agent-ui/conversation/integrations.generated.tsx"), "utf8")).toContain("<Integration0>{children}</Integration0>");
  for (const name of Object.keys(files)) await rm(path.join(source, name));
  await writeGeneratedFrontendToolRegistries(root);
  await writeGeneratedConversationIntegrationRegistry(root);
  for (const name of ["agent-contract/frontend-tools.generated.ts", "agent-ui/conversation/frontend-tool-uis.generated.ts", "agent-ui/conversation/integrations.generated.tsx"]) {
    expect(await readFile(path.join(source, name), "utf8")).not.toContain('from "./');
  }
});
