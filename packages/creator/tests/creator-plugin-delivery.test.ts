import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { addExtraTools } from "../src/agent/extra-tools.js";
import type { ToolContext } from "../src/agent/tools.js";
import { creatorContentHash } from "../src/agent/files/creatorFileState.js";

const state = vi.hoisted(() => ({ project: {} as any, runtime: {} as any }));
vi.mock("../src/agent/operator.js", () => ({ requestOperator: async () => state.project }));
vi.mock("../src/agent/runtime-evidence.js", () => ({ inspectRuntime: async () => state.runtime }));
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

async function fixture(target = "application", enabled = true) {
  const root = await mkdtemp(path.join(tmpdir(), "Creator 交付 中文 ")); roots.push(root);
  const source = "src/应用", pluginId = "report";
  await mkdir(path.join(root, ".agent-ui"));
  await writeFile(path.join(root, ".agent-ui/project.json"), JSON.stringify({ sourceRoot: source }));
  await mkdir(path.join(root, source, "plugins", pluginId), { recursive: true });
  for (const [file, content] of [["manifest.json", JSON.stringify({ id: pluginId })], ["definition.ts", "export default { Component: () => null };"], ["index.tsx", "export const Report = () => null;"]]) {
    await writeFile(path.join(root, source, "plugins", pluginId, file!), content!);
  }
  const model = path.join(root, source, "app-ui.json"), original = JSON.stringify({ applicationPlugins: [{ pluginId }], root: { type: "column", children: [] } });
  await writeFile(model, original);
  state.runtime = { compositionFresh: true, currentErrors: [] };
  state.project = { capabilityCatalog: { pluginIds: [pluginId], generatedFileFresh: true },
    pluginAssets: [{ pluginId, ownership: "project_source" }],
    plugins: [{ id: "p5", pluginId, enabled, target: { type: target }, index: 0 }] };
  const context = { root, signal: new AbortController().signal, verificationMode: "static_only", activity: { revision: 3, validationRevision: 3 },
    pluginPlans: new Map([[pluginId, { status: "authorized", workKind: "create-plugin", contract: { renderingCategory: "application" } }]]) } as unknown as ToolContext;
  const tools = new Map<string, (input: any) => any>();
  addExtraTools(context, (name, _description, _schema, invoke) => { tools.set(name, invoke); });
  return { context, tools, inspect: () => tools.get("inspect_ui_plugin_delivery")!({}), model, original };
}

it.each([["application", true, true], ["layout_slot", true, false], ["application", false, false]])(
  "uses inspected placement for shorthand application entries: %s enabled=%s", async (target, enabled, composed) => {
    const { inspect, model, original } = await fixture(target as string, enabled as boolean);
    const result = await inspect(), delivery = result.deliveries[0].delivery;
    expect(delivery.stages.composed).toBe(composed);
    expect(delivery.blockers.includes("PLUGIN_NOT_COMPOSED")).toBe(!composed);
    expect(await readFile(model, "utf8")).toBe(original);
  });

it("retains the missing interaction evidence blocker after recognizing a composed application Plugin", async () => {
  const { context, inspect } = await fixture();
  context.verificationMode = "static_and_runtime";
  context.behaviorVerificationEnabled = true;
  context.pluginPlans!.get("report")!.contract.interactions = ["sort rows"];
  const result = await inspect();
  expect(result.deliveries[0]).toMatchObject({ delivery: { stages: { composed: true }, blockers: ["PLUGIN_BEHAVIOR_VERIFICATION_MISSING"] },
    verification: { static: "pass", runtime: "pass", interaction: "not-run" } });
});

it("disables project Playwright without blocking a statically and Runtime verified delivery", async () => {
  const { context, tools, inspect, model, original } = await fixture();
  context.verificationMode = "static_and_runtime";
  const contract = context.pluginPlans!.get("report")!.contract;
  contract.interactions = ["sort rows"]; contract.verificationMethod = "browser-test";
  // Even saved evidence must not turn a disabled check into a claimed PASS.
  context.behavior = new Map([["report", { status: "passed", revision: 3, interactionHash: creatorContentHash(JSON.stringify(contract.interactions)) }]]);
  expect(tools.has("verify_ui_plugin_behavior")).toBe(false);
  expect((await inspect()).deliveries[0]).toMatchObject({
    delivery: { status: "completed", blockers: [] },
    verification: { static: "pass", runtime: "pass", interaction: "not-run", interactionPolicy: "disabled" },
  });
  expect(await readFile(model, "utf8")).toBe(original);
});

it.each(["static", "runtime"])("keeps %s failures blocking when Playwright is disabled", async failed => {
  const { context, inspect } = await fixture();
  context.verificationMode = "static_and_runtime";
  context.pluginPlans!.get("report")!.contract.interactions = ["sort rows"];
  if (failed === "static") context.activity.validationRevision = 2;
  else state.runtime.compositionFresh = false;
  const result = (await inspect()).deliveries[0];
  expect(result.delivery.status).toBe("blocked");
  expect(result.delivery.blockers).toContain(failed === "static" ? "PLUGIN_STATIC_VERIFICATION_MISSING" : "PLUGIN_RUNTIME_VERIFICATION_MISSING");
  expect(result.delivery.blockers).not.toContain("PLUGIN_BEHAVIOR_VERIFICATION_MISSING");
  expect(result.verification).toMatchObject({ interaction: "not-run", interactionPolicy: "disabled" });
});
