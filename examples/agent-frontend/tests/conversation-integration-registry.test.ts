import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import { writeGeneratedConversationIntegrationRegistry } from "../scripts/generate-conversation-integration-registry";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "conversation-integration-")); roots.push(root);
  await mkdir(path.join(root, ".agent-ui"));
  await writeFile(path.join(root, ".agent-ui/project.json"), JSON.stringify({ version: "2", mode: "platform", sourceRoot: "custom-ui" }));
  const directory = path.join(root, "custom-ui/agent-ui/conversation/integrations"); await mkdir(directory, { recursive: true });
  return { root, directory, output: path.join(root, "custom-ui/agent-ui/conversation/integrations.generated.tsx") };
}
it("emits a pass-through host with no installed integrations", async () => {
  const f = await fixture(); await writeGeneratedConversationIntegrationRegistry(f.root);
  expect(await readFile(f.output, "utf8")).toContain("return children;");
});
it("composes integrations in filename order and accepts named re-exports", async () => {
  const f = await fixture();
  await writeFile(path.join(f.directory, "zeta.tsx"), 'export { Provider as ConversationIntegration } from "./provider";');
  await writeFile(path.join(f.directory, "alpha.tsx"), 'export function ConversationIntegration({ children }) { return children; }');
  await writeGeneratedConversationIntegrationRegistry(f.root);
  const source = await readFile(f.output, "utf8");
  expect(source).toContain('Integration0 } from "./integrations/alpha"');
  expect(source).toContain('Integration1 } from "./integrations/zeta"');
  expect(source).toContain("<Integration0><Integration1>{children}</Integration1></Integration0>");
  await writeGeneratedConversationIntegrationRegistry(f.root);
  expect(await readFile(f.output, "utf8")).toBe(source);
  await rm(path.join(f.directory, "alpha.tsx")); await rm(path.join(f.directory, "zeta.tsx"));
  await writeGeneratedConversationIntegrationRegistry(f.root);
  expect(await readFile(f.output, "utf8")).toContain("return children;");
});
it("rejects missing exports and symbolic link modules before changing the registry", async () => {
  const f = await fixture(); await writeGeneratedConversationIntegrationRegistry(f.root);
  const before = await readFile(f.output, "utf8");
  await writeFile(path.join(f.directory, "broken.tsx"), "export const SomethingElse = 1;");
  await expect(writeGeneratedConversationIntegrationRegistry(f.root)).rejects.toThrow("must export ConversationIntegration");
  expect(await readFile(f.output, "utf8")).toBe(before);
  await rm(path.join(f.directory, "broken.tsx"));
  await symlink(f.output, path.join(f.directory, "linked.tsx"));
  await expect(writeGeneratedConversationIntegrationRegistry(f.root)).rejects.toThrow();
  expect(await readFile(f.output, "utf8")).toBe(before);
});
