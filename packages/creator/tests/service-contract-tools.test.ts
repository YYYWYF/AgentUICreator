import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { RunActivity } from "../src/agent/activity.js";
import { prepareService, applyService } from "../src/agent/service-tools.js";
import type { ToolContext } from "../src/agent/tools.js";
const approvals = vi.hoisted(() => ({ allow: false, payload: undefined as any }));
vi.mock("@langchain/langgraph", () => ({ interrupt: (payload: any) => {
  approvals.payload = payload;
  if (!approvals.allow) throw new Error("Awaiting real user");
  return { answers: { [payload.steps[0].id]: ["approve"] } };
} }));
vi.mock("../src/agent/operator.js", () => ({ requestOperator: async (_root: string, name: string) => name === "list_ui_plugins"
  ? { pluginAssets: [{ pluginId: "card" }] } : { services: [] } }));
const roots: string[] = [];
afterEach(async () => { approvals.allow = false; approvals.payload = undefined; for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "creator Service 中文 空格-")); roots.push(root);
  await mkdir(path.join(root, ".agent-ui")); await mkdir(path.join(root, "src/界面"), { recursive: true });
  await writeFile(path.join(root, ".agent-ui/project.json"), '{"sourceRoot":"src/界面"}');
  const signal = new AbortController().signal;
  const context = { root, threadId: "service", userMessage: "给卡片添加一个按钮插件，点击收起卡片。", readOnly: false, signal,
    activity: new RunActivity(root, "service-run", signal), authorizedPlugins: new Set(["dismiss"]),
    pluginPlans: new Map([["dismiss", { status: "authorized", workKind: "create-plugin", scopeHash: "bound", evidence: {}, contract: {} }]]),
    validation: { ensureBaseline: vi.fn(async () => {}) } } as unknown as ToolContext;
  const proposal = { changeKind: "create", serviceName: "help.card", contractPath: "services/help-card.ts",
    ownerPluginId: "card", consumers: [{ pluginId: "dismiss", dependencyMode: "required" }], reason: "Existing card owns the cross-Plugin action" };
  return { context, proposal };
}
it.each(["help.card", "project.quick-help", "agent-ui.help"])("proposes %s for a bound new Plugin, requires no extra consent, and writes under sourceRoot", async serviceName => {
  const { context, proposal } = await fixture();
  proposal.serviceName = serviceName;
  expect(context.activity.before.size).toBe(0);
  const plan = await prepareService(context, proposal);
  expect(approvals.payload).toBeUndefined();
  const content = 'export const HELP_CARD_SERVICE="help.card"; export interface HelpCardService { collapse():void; }';
  await applyService(context, { planId: plan.planId, content }, "create");
  expect(await readFile(path.join(context.root, "src/界面/services/help-card.ts"), "utf8")).toBe(content);
  await expect(readFile(path.join(context.root, "services/help-card.ts"))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(applyService(context, { planId: plan.planId, content }, "create")).rejects.toThrow("PLAN_INVALID");
});
it.each(["pending", "unbound"])("does not admit an %s new Plugin as an existing identity", async state => {
  const { context, proposal } = await fixture();
  if (state === "pending") context.pluginPlans!.get("dismiss")!.status = "pending";
  else context.authorizedPlugins.clear();
  await expect(prepareService(context, proposal)).rejects.toThrow("SERVICE_CONTRACT_PLUGIN_NOT_FOUND");
  expect(approvals.payload).toBeUndefined();
});
it("invalidates concrete Service authorization if sourceRoot changes", async () => {
  const { context, proposal } = await fixture(); approvals.allow = true;
  const plan = await prepareService(context, proposal);
  await writeFile(path.join(context.root, ".agent-ui/project.json"), '{"sourceRoot":"src/other"}');
  await expect(applyService(context, { planId: plan.planId, content: "export {};" }, "create")).rejects.toThrow("PLAN_STALE");
  expect(context.validation!.ensureBaseline).not.toHaveBeenCalled();
});
