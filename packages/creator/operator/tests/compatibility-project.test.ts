import { fileURLToPath } from "node:url";
import { afterEach, expect, test, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink, realpath } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { planCompatibilityProject, initializeCompatibilityProject, buildCompatibilityProject } from "../src/project/compatibility-project";
import { digest, readCompatibilityBinding, safeCompatibilityPath } from "../src/project/compatibility-binding";
import { planIntegrationRecipe, applyIntegrationRecipe } from "../src/project/integration-recipe";
import * as packageIdentity from "../src/updates/package-identity";
const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
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
  const bridge = JSON.parse(await readFile(new URL("../../../web-component/package.json", import.meta.url), "utf8"));
  expect(result.compatibilityPlan?.dependencies.react).toBe(bridge.dependencies.react);
  expect(result.compatibilityPlan?.dependencies["react-dom"]).toBe(bridge.dependencies["react-dom"]);
  expect(result.compatibilityPlan?.devDependencies.tailwindcss).toBe(bridge.devDependencies.tailwindcss);
  expect(result.compatibilityPlan?.dependencies["@za38.03/agent-ui-core"]).not.toMatch(/workspace:/);
  expect(await readdir(root)).toEqual(before);
  await expect(initializeCompatibilityProject({ ...input, planId: "stale" })).rejects.toMatchObject({ code: "AGENT_UI_COMPATIBILITY_PLAN_STALE" });
  expect(await readdir(root)).toEqual(before);
  await writeFile(path.join(root, "package.json"), JSON.stringify({ dependencies: { vue: "3.5.42" }, workspaces: ["*"] }));
  await expect(planCompatibilityProject(input)).resolves.toMatchObject({ valid: true });
});
test.each([
  { react: "20.0.0", reactDom: "21.0.0", tailwind: "99.0.0", reactTypes: "^20.0.0", domTypes: "^21.0.0" },
  { react: "^18.3.1", reactDom: "^18.3.1", tailwind: "^4.0.0", reactTypes: "^18.0.0", domTypes: "^18.0.0" },
])("keeps version recommendations advisory and preserves declarations: $react / $reactDom", async versions => {
  const root = await host();
  const creator = await packageIdentity.ownPackageIdentity("@za38.03/agent-ui-creator");
  const readIdentity = packageIdentity.readPackageIdentity;
  const actual = await readIdentity(creator.root, "@za38.03/agent-ui-web-component");
  if (!actual) throw new Error("Missing bridge fixture");
  const bridgeRoot = await mkdtemp(path.join(os.tmpdir(), "bridge versions 中文-")); roots.push(bridgeRoot);
  await writeFile(path.join(bridgeRoot, "package.json"), JSON.stringify({
    dependencies: { react: versions.react, "react-dom": versions.reactDom },
    devDependencies: { tailwindcss: versions.tailwind },
  }));
  vi.spyOn(packageIdentity, "readPackageIdentity").mockImplementation((from, name) =>
    name === actual.name ? Promise.resolve({ ...actual, root: bridgeRoot, version: "99.0.0" }) : readIdentity(from, name));
  const result = await planCompatibilityProject({ projectRoot: root, sourceRoot: "agent-ui", mode: "embedded" });
  expect(result.valid).toBe(true);
  const plan = result.compatibilityPlan;
  expect(plan?.dependencies[actual.name]).toBe("99.0.0");
  expect(plan?.dependencies.react).toBe(versions.react);
  expect(plan?.dependencies["react-dom"]).toBe(versions.reactDom);
  expect(plan?.devDependencies.tailwindcss).toBe(versions.tailwind);
  expect(plan?.devDependencies["@types/react"]).toBe(versions.reactTypes);
  expect(plan?.devDependencies["@types/react-dom"]).toBe(versions.domTypes);
  expect(plan?.advisories).toContainEqual(expect.objectContaining({ name: actual.name, version: "99.0.0" }));
  for (const name of ["react", "tailwindcss", ...(versions.react !== versions.reactDom ? ["react-dom"] : [])]) expect(plan?.advisories.some(advice => advice.name === name)).toBe(true);
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
        await symlink(fileURLToPath(new URL(`../../../${owner}/`, import.meta.url)), directory, process.platform === "win32" ? "junction" : "dir");
      } else {
        await mkdir(directory, { recursive: true });
        await writeFile(path.join(directory, "package.json"), JSON.stringify({ name, version: version.replace(/^[~^]/, "") }));
      }
    }
    return "";
  });
  expect(await readFile(path.join(result.projectRoot, "src/agent-ui/integrations/web-component-bridge/register.tsx"), "utf8")).toContain("customElements");
  expect(await readFile(path.join(result.projectRoot, "src/agent-ui/application/AgentUICompatibilityRoot.tsx"), "utf8")).toContain("<ProjectProvider>");
  const lock = JSON.parse(await readFile(path.join(result.projectRoot, ".agent-ui/source-lock.json"), "utf8"));
  expect(Object.keys(lock.items["integration/web-component-bridge"].files)).toContain("application/AgentUICompatibilityRoot.tsx");
  expect(Object.keys(lock.items["foundation/core"].files)).not.toContain("application/AgentUICompatibilityRoot.tsx");
  expect(await readFile(path.join(root, "package.json"), "utf8")).toBe(packageBefore);
  expect((await readCompatibilityBinding(root))?.projectRoot).toBe(await realpath(result.projectRoot));
});
