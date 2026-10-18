import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink, realpath } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { planCompatibilityProject, initializeCompatibilityProject, buildCompatibilityProject } from "../src/project/compatibility-project";
import { digest, readCompatibilityBinding, safeCompatibilityPath } from "../src/project/compatibility-binding";
import { planIntegrationRecipe, applyIntegrationRecipe } from "../src/project/integration-recipe";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function host() {
  const root = await mkdtemp(path.join(os.tmpdir(), "compatibility space 中文-")); roots.push(root);
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "package.json"), JSON.stringify({ dependencies: { vue: "3.5.42" }, devDependencies: { vite: "8.3.0" } }));
  await writeFile(path.join(root, "src/App.vue"), "<template><main></main></template>\n");
  return root;
}
test("Vue setup plans a separate package tree and refuses stale consent before mutation", async () => {
  const root = await host(); const input = { projectRoot: root, sourceRoot: "agent-ui", mode: "embedded" as const };
  const before = await readdir(root);
  const result = await planCompatibilityProject(input);
  expect(result.valid).toBe(true);
  expect((await planCompatibilityProject({ ...input, sourceRoot: "public/agent-ui" })).valid).toBe(false);
  expect(result.compatibilityPlan?.dependencies.react).toBeDefined();
  expect(result.compatibilityPlan?.dependencies["@za38.03/agent-ui-core"]).not.toMatch(/workspace:/);
  expect(await readdir(root)).toEqual(before);
  await expect(initializeCompatibilityProject({ ...input, planId: "stale" })).rejects.toMatchObject({ code: "AGENT_UI_COMPATIBILITY_PLAN_STALE" });
  expect(await readdir(root)).toEqual(before);
  await writeFile(path.join(root, "package.json"), JSON.stringify({ dependencies: { vue: "3.5.42" }, workspaces: ["*"] }));
  await expect(planCompatibilityProject(input)).rejects.toMatchObject({ code: "AGENT_UI_COMPATIBILITY_WORKSPACE_UNSUPPORTED" });
});
test("publishes producer output, invalidates stale recipes, and protects manual host edits", async () => {
  const root = await host(); const producer = path.join(root, "agent-ui");
  await mkdir(path.join(root, ".agent-ui")); await mkdir(path.join(producer, ".agent-ui"), { recursive: true });
  await mkdir(path.join(producer, "src"));
  await writeFile(path.join(producer, "src/marker.ts"), "export const marker='custom';\n");
  await writeFile(path.join(producer, "package.json"), JSON.stringify({ dependencies: { react: "19.1.1" }, scripts: { build: "test-builder" } }));
  await writeFile(path.join(root, ".agent-ui/producer.json"), JSON.stringify({ schemaVersion: 1, producerRoot: "agent-ui" }));
  await writeFile(path.join(producer, ".agent-ui/consumer.json"), JSON.stringify({ schemaVersion: 1, hostRelativePath: ".." }));
  const run = async (cwd: string) => { await mkdir(path.join(cwd, "dist/agent-ui-web-component"), { recursive: true }); await writeFile(path.join(cwd, "dist/agent-ui-web-component/agent-ui.js"), "/* custom source build */"); return ""; };
  expect((await planIntegrationRecipe(producer, { targetFile: "src/App.vue" })).status).toBe("module-required");
  await buildCompatibilityProject(producer, run);
  expect((await readCompatibilityBinding(root))?.publishedHash).toBe(digest("/* custom source build */"));
  const plan = await planIntegrationRecipe(producer, { targetFile: "src/App.vue" });
  expect(plan.status).toBe("planned");
  if (plan.status !== "planned") throw new Error("missing recipe");
  expect(plan.host.framework).toBe("vue");
  await writeFile(path.join(producer, "src/marker.ts"), "export const marker='updated';\n");
  await expect(applyIntegrationRecipe(producer, plan.integrationRecipe)).rejects.toBeDefined();
  await buildCompatibilityProject(producer, run);
  await writeFile(path.join(root, "public/agent-ui.js"), "manual change");
  await expect(buildCompatibilityProject(producer, run)).rejects.toMatchObject({ code: "AGENT_UI_COMPATIBILITY_ASSET_CONFLICT" });
  expect(await readFile(path.join(root, "public/agent-ui.js"), "utf8")).toBe("manual change");
});
test("rejects Windows absolute/drive paths and traversal independently of the host OS", async () => {
  const root = await host();
  for (const invalid of ["C:\\projects\\agent", "C:/projects/agent", "\\\\server\\share", "../escape", "foo\\bar"]) await expect(safeCompatibilityPath(root, invalid)).rejects.toBeDefined();
});

test("initializes the producer once and adds the bridge without reinstalling managed foundations", async () => {
  const root = await host(); const packageBefore = await readFile(path.join(root, "package.json"), "utf8");
  const input = { projectRoot: root, sourceRoot: "agent-ui", mode: "embedded" as const };
  const plan = await planCompatibilityProject(input);
  const result = await initializeCompatibilityProject({ ...input, planId: plan.compatibilityPlan!.id }, async target => {
    for (const [name, version] of Object.entries({ ...plan.compatibilityPlan!.dependencies, ...plan.compatibilityPlan!.devDependencies })) {
      const directory = path.join(target, "node_modules", ...name.split("/"));
      await mkdir(path.dirname(directory), { recursive: true });
      if (name.startsWith("@za38.03/agent-ui-")) {
        const owner = name.slice("@za38.03/agent-ui-".length);
        await symlink(fileURLToPath(new URL(`../../${owner}/`, import.meta.url)), directory, process.platform === "win32" ? "junction" : "dir");
      } else {
        await mkdir(directory, { recursive: true });
        await writeFile(path.join(directory, "package.json"), JSON.stringify({ name, version: version.replace(/^[~^]/, "") }));
      }
    }
    return "";
  });
  expect(await readFile(path.join(result.projectRoot, "src/agent-ui/integrations/web-component-bridge/register.tsx"), "utf8")).toContain("customElements");
  expect(await readFile(path.join(root, "package.json"), "utf8")).toBe(packageBefore);
  expect((await readCompatibilityBinding(root))?.projectRoot).toBe(await realpath(result.projectRoot));
});
