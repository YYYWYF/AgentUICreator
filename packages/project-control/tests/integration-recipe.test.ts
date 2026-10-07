import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import os from "node:os";
import { afterEach, expect, test } from "vitest";
import { planIntegrationRecipe, applyIntegrationRecipe, verifyIntegrationRecipe } from "../src/project/integration-recipe";
import { handleUIProjectControlRequest } from "../src/handler";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture(dependencies: Record<string, string> = { vue: "^3.5.0", vite: "^8.0.0" }) {
  const root = await mkdtemp(path.join(os.tmpdir(), "integration-recipe-")); roots.push(root);
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "package.json"), JSON.stringify({ dependencies }));
  await writeFile(path.join(root, "src/App.vue"), '<script setup lang="ts">\n</script>\n<template><main><h1>Host</h1></main></template>\n');
  await writeFile(path.join(root, "src/main.ts"), "// existing Host entry\n");
  await mkdir(path.join(root, "public"));
  await writeFile(path.join(root, "public/agent-ui.js"), "// compiled bundle\n" + " ".repeat(30_000));
  return root;
}
async function recipe(root: string) {
  const plan = await planIntegrationRecipe(root, { targetFile: "src/App.vue", moduleSpecifier: "/agent-ui.js" });
  if (plan.status !== "planned") throw new Error(plan.status);
  return plan.integrationRecipe;
}
test("guide is read-only, exposes facts and requires an explicit target", async () => {
  const root = await fixture();
  const before = await readdir(root, { recursive: true });
  expect(await planIntegrationRecipe(root)).toMatchObject({ status: "target-required", host: { framework: "vue", frameworkVersion: "^3.5.0", toolchain: "vite", entryFile: "src/main.ts", candidates: ["src/App.vue"] } });
  const result = await handleUIProjectControlRequest({ operation: "plan_agent_ui_integration", input: { targetFile: "src/App.vue", moduleSpecifier: "/agent-ui.js" } }, root);
  expect(result.ok).toBe(true);
  expect(await readdir(root, { recursive: true })).toEqual(before);
});
test("guide, apply, repeated apply and manual verification consume identical edits", async () => {
  const root = await fixture(); const planned = await recipe(root);
  expect((await verifyIntegrationRecipe(root, planned)).status).toBe("failed");
  expect(await applyIntegrationRecipe(root, planned)).toMatchObject({ status: "passed", changedPaths: ["src/components/AgentUIBridge.vue", "src/App.vue"] });
  expect(await applyIntegrationRecipe(root, planned)).toMatchObject({ status: "passed", changedPaths: [] });
  expect(await readFile(path.join(root, "src/main.ts"), "utf8")).toBe("// existing Host entry\n");
  const manual = await fixture(); const manualRecipe = await recipe(manual);
  for (const edit of manualRecipe.edits) { await mkdir(path.dirname(path.join(manual, edit.file)), { recursive: true }); await writeFile(path.join(manual, edit.file), edit.after); }
  expect((await verifyIntegrationRecipe(manual, manualRecipe)).status).toBe("passed");
});
test("stale targets, tampered edits and unresolved modules cannot cause partial writes", async () => {
  const root = await fixture(); const planned = await recipe(root);
  await writeFile(path.join(root, "src/App.vue"), "user edit");
  await expect(applyIntegrationRecipe(root, planned)).rejects.toMatchObject({ code: "INTEGRATION_FILE_CONFLICT" });
  expect(await readdir(path.join(root, "src"))).toEqual(["App.vue", "main.ts"]);
  const fresh = await fixture(); const edited = await recipe(fresh);
  edited.edits[0]!.after = "arbitrary code";
  await expect(applyIntegrationRecipe(fresh, edited)).rejects.toMatchObject({ code: "INTEGRATION_RECIPE_INVALID" });
  const missing = await planIntegrationRecipe(fresh, { targetFile: "src/App.vue", moduleSpecifier: "/missing.js" });
  if (missing.status !== "planned") throw new Error(missing.status);
  await expect(applyIntegrationRecipe(fresh, missing.integrationRecipe)).rejects.toMatchObject({ code: "INTEGRATION_COMPILED_MODULE_REQUIRED" });
});
test("React stays canonical, Nuxt unsupported, symlink and unknown target rejected", async () => {
  expect((await planIntegrationRecipe(await fixture({ react: "19" }))).status).toBe("canonical-react");
  expect((await planIntegrationRecipe(await fixture({ vue: "3", nuxt: "4" }))).status).toBe("unsupported");
  const root = await fixture();
  await expect(planIntegrationRecipe(root, { targetFile: "../App.vue" })).rejects.toMatchObject({ code: "INTEGRATION_TARGET_NOT_DISCOVERED" });
  await symlink(path.join(root, "public"), path.join(root, "src/components"));
  await expect(recipe(root)).rejects.toMatchObject({ code: "INTEGRATION_SYMLINK_UNSUPPORTED" });
});
test("plain HTML recipe uses the same config and resolved public ESM", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "integration-html-")); roots.push(root);
  await writeFile(path.join(root, "agent-ui.js"), "export {};\n");
  await writeFile(path.join(root, "index.html"), "<html><body><h1>Host</h1></body></html>");
  const plan = await planIntegrationRecipe(root, { targetFile: "index.html", moduleSpecifier: "/agent-ui.js", locale: "zh-CN" });
  if (plan.status !== "planned") throw new Error(plan.status);
  expect((await applyIntegrationRecipe(root, plan.integrationRecipe)).status).toBe("passed");
});
test("Vue CLI gets a Vue 2 lifecycle wrapper without React or setup syntax", async () => {
  const root = await fixture({ vue: "^2.7.0", "@vue/cli-service": "^5.0.0" });
  await writeFile(path.join(root, "src/App.vue"), "<template><main><h1>Host</h1></main></template>\n");
  const planned = await recipe(root);
  expect(planned.host.toolchain).toBe("vue-cli");
  expect(planned.edits[0]!.after).toContain("beforeDestroy()");
  expect(planned.edits[1]!.after).not.toContain("<script setup>");
  expect((await applyIntegrationRecipe(root, planned)).status).toBe("passed");
});

test("clean Vue uses Host distribution without installing producer dependencies", async () => {
  const root = await fixture();
  await rm(path.join(root, "public"), { recursive: true });
  const initial = await readdir(root, { recursive: true });
  const plan = await planIntegrationRecipe(root, { targetFile: "src/App.vue" });
  if (plan.status !== "planned") throw new Error(plan.status);
  expect(plan.integrationRecipe.integration.moduleSpecifier).toBe("/agent-ui.js");
  expect(plan.integrationRecipe.edits[0]!.after).toContain('new URL("/agent-ui.js", window.location.href).href');
  expect(await readdir(root, { recursive: true })).toEqual(initial);
  const manifest = await readFile(path.join(root, "package.json"), "utf8");
  const result = await applyIntegrationRecipe(root, plan.integrationRecipe);
  expect(result).toMatchObject({ status: "passed", changedPaths: ["public/agent-ui.js", "src/components/AgentUIBridge.vue", "src/App.vue"] });
  expect((await readFile(path.join(root, "public/agent-ui.js"))).length).toBeGreaterThan(30_000);
  expect(await readFile(path.join(root, "package.json"), "utf8")).toBe(manifest);
  expect((await verifyIntegrationRecipe(root, plan.integrationRecipe)).status).toBe("passed");
  expect((await applyIntegrationRecipe(root, plan.integrationRecipe)).changedPaths).toEqual([]);
});

test("a failed apply rolls back a newly prepared Bridge asset", async () => {
  const root = await fixture();
  await rm(path.join(root, "public"), { recursive: true });
  const planned = await recipe(root);
  await mkdir(path.join(root, "src/components"));
  const staging = path.join(root, `src/components/AgentUIBridge.vue.agent-ui-${planned.id}.tmp`);
  await writeFile(staging, "existing concurrent staging file");
  await expect(applyIntegrationRecipe(root, planned)).rejects.toMatchObject({ code: "EEXIST" });
  await expect(readFile(path.join(root, "public/agent-ui.js"))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(path.join(root, "src/App.vue"), "utf8")).toBe(planned.edits[1]!.before);
});

async function cleanManualFixture() {
  const root = await fixture();
  await rm(path.join(root, "public"), { recursive: true });
  return root;
}
async function snapshot(root: string) {
  const result: Record<string, string> = {};
  for (const file of (await readdir(root, { recursive: true })).sort()) {
    const absolute = path.join(root, file);
    if ((await stat(absolute)).isFile()) result[file] = (await readFile(absolute)).toString("base64");
  }
  return result;
}
test("clean manual guide describes the missing compiled asset and only two code edits, without writes", async () => {
  const root = await cleanManualFixture();
  const before = await snapshot(root);
  const response = await handleUIProjectControlRequest({ operation: "plan_agent_ui_integration", input: { targetFile: "src/App.vue" } }, root);
  expect(response).toMatchObject({ ok: true, result: { status: "planned", integrationRecipe: {
    manualPrerequisites: [{ id: "compiled-bridge", kind: "compiled-asset", target: "public/agent-ui.js", status: "missing", hostPreparable: true }],
  } } });
  const planned = await recipe(root);
  expect(planned.edits.map(edit => edit.file)).toEqual(["src/components/AgentUIBridge.vue", "src/App.vue"]);
  expect(JSON.stringify(planned).length).toBeLessThan(40_000);
  expect(await snapshot(root)).toEqual(before);
});
test("manual asset preparation writes only the compiled asset and is idempotent", async () => {
  const root = await cleanManualFixture();
  const planned = await recipe(root);
  const before = await snapshot(root);
  const prepare = () => handleUIProjectControlRequest({ operation: "prepare_agent_ui_integration_asset", input: { recipe: planned } }, root);
  expect(await prepare()).toMatchObject({ ok: true, result: { status: "ready", recipeId: planned.id, target: "public/agent-ui.js", changedPaths: ["public/agent-ui.js"] } });
  const after = await snapshot(root);
  const { "public/agent-ui.js": asset, ...unchanged } = after;
  expect(asset).toBeTruthy();
  expect(unchanged).toEqual(before);
  expect((await recipe(root)).manualPrerequisites?.[0]?.status).toBe("ready");
  expect(await prepare()).toMatchObject({ ok: true, result: { changedPaths: [] } });
  expect(await snapshot(root)).toEqual(after);
  expect((await verifyIntegrationRecipe(root, planned)).status).toBe("failed");
});
test("canonical manual edits verify with the original missing-asset recipe, with zero verify writes", async () => {
  const root = await cleanManualFixture();
  const original = await recipe(root);
  expect(original.manualPrerequisites?.[0]?.status).toBe("missing");
  expect(await handleUIProjectControlRequest({ operation: "prepare_agent_ui_integration_asset", input: { recipe: original } }, root)).toMatchObject({ ok: true });
  for (const edit of original.edits) {
    await mkdir(path.dirname(path.join(root, edit.file)), { recursive: true });
    await writeFile(path.join(root, edit.file), edit.after);
  }
  const before = await snapshot(root);
  expect(await handleUIProjectControlRequest({ operation: "verify_agent_ui_integration", input: { recipe: original } }, root)).toMatchObject({ ok: true, result: { status: "passed", recipeId: original.id, changedPaths: [] } });
  expect(await snapshot(root)).toEqual(before);
  // Existing conversations can keep recipes created before manualPrerequisites.
  const { id: _id, manualPrerequisites: _prerequisites, ...body } = original;
  const legacy = { id: createHash("sha256").update(JSON.stringify(body)).digest("hex"), ...body };
  expect((await verifyIntegrationRecipe(root, legacy)).status).toBe("passed");
  expect(await snapshot(root)).toEqual(before);
});
