import { expect, it } from "vitest";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { rememberSourceRead, workingSourceContext, workingDevelopmentContext, rememberPublicApiRead, workingPublicApiContext, projectPublicApiRead } from "../src/agent/working-context.js";
import { CreatorContextWindow, estimateMessageTokens } from "../src/agent/context-window.js";
import type { ToolContext } from "../src/agent/tools.js";
function context() {
  const hashes = new Map([["src/界面/index.tsx", { hash: "read-hash" }]]);
  const ctx = { activity: { observations: { get: (file: string) => hashes.get(file) } },
    editingSelection: { filePaths: ["src/界面/index.tsx"] },
    readRanges: new Map([["src/界面/index.tsx", [{ hash: "read-hash", start: 1, end: 2 }]]]) } as unknown as ToolContext;
  rememberSourceRead(ctx, { path: "/src/界面/index.tsx", hash: "read-hash", content: "1: export const stable = 1;\n2: export default stable;", totalLines: 2, nextOffset: null }, 0);
  return { ctx, hashes };
}
it("reuses exactly read source without granting freshness or overwriting changed evidence", () => {
  const { ctx, hashes } = context();
  expect(workingSourceContext(ctx, 1000)[0]?.content).toContain("export const stable = 1");
  hashes.set("src/界面/index.tsx", { hash: "changed" });
  expect(workingSourceContext(ctx, 1000)).toEqual([]);
  expect(ctx.readRanges!.get("src/界面/index.tsx")![0]!.hash).toBe("read-hash");
  hashes.set("src/界面/index.tsx", { hash: "read-hash" }); ctx.readRanges!.clear();
  expect(workingSourceContext(ctx, 1000)).toEqual([]);
});
it("retains committed writes through summaries without granting new read ranges, and drops superseded bytes", async () => {
  const { ctx, hashes } = context(), file = "src/界面/index.tsx";
  const beforeRanges = JSON.stringify([...ctx.readRanges!]);
  Object.assign(ctx.activity, { after: new Map([[file, { exists: true, hash: "written", content: "export const written = 2;\r\n" }]]) });
  hashes.set(file, { hash: "written" });
  const messages = workingSourceContext(ctx, 1000);
  expect(String(messages[0]!.content)).toContain('"committedInCurrentRun":true');
  expect(String(messages[0]!.content)).toContain("export const written = 2");
  expect(String(messages[0]!.content)).not.toContain('"readInCurrentRun":true');
  expect(JSON.stringify([...ctx.readRanges!])).toBe(beforeRanges);
  const window = new CreatorContextWindow({ environment: { CREATOR_CONTEXT_MAX_TOKENS: "6000", CREATOR_CONTEXT_KEEP_TOKENS: "500", CREATOR_MODEL_MAX_TOKENS: "512" },
    request: "Finish the code", signal: () => new AbortController().signal, workingContext: budget => workingSourceContext(ctx, budget),
    model: () => ({ invoke: async () => new AIMessage("Historical summary without the implementation.") }) as any, log: async () => {} });
  const projected = await window.project([new HumanMessage("Old history ".repeat(3000)), new HumanMessage("Finish the code")], []);
  expect(window.stats.compactions).toBeGreaterThan(0);
  expect(projected.some(message => String(message.content).includes("export const written = 2"))).toBe(true);
  hashes.set(file, { hash: "external-change" });
  expect(workingSourceContext(ctx, 1000)).toEqual([]);
});
it("bounds working source memory and model input without imposing an execution limit", () => {
  const { ctx, hashes } = context();
  for (let i = 0; i < 100; i++) {
    const file = `src/file-${i}.tsx`; hashes.set(file, { hash: String(i) });
    ctx.readRanges!.set(file, [{ hash: String(i), start: 1, end: 120 }]);
    rememberSourceRead(ctx, { path: "/" + file, hash: String(i), content: Array.from({ length: 120 }, (_, n) => `${n + 1}: 中文🌟${"x".repeat(90)}`).join("\n"), totalLines: 120, nextOffset: null }, 0);
  }
  expect(ctx.sourceSnapshots!.size).toBeLessThanOrEqual(12);
  expect(ctx.sourceSnapshots!.has("src/界面/index.tsx")).toBe(true);
  expect(estimateMessageTokens(workingSourceContext(ctx, 400))).toBeLessThanOrEqual(400);
});
it("keeps working code outside summaries and accounts for it in the input budget", async () => {
  const { ctx } = context(), logs: any[] = [];
  const window = new CreatorContextWindow({ environment: { CREATOR_CONTEXT_MAX_TOKENS: "6000", CREATOR_CONTEXT_KEEP_TOKENS: "500", CREATOR_MODEL_MAX_TOKENS: "512" },
    request: "Change the component", signal: () => new AbortController().signal,
    workingContext: budget => workingSourceContext(ctx, budget),
    model: () => ({ invoke: async () => new AIMessage("Historical task summary. No source code retained.") }) as any,
    log: async (event, value) => { logs.push({ event, ...value }); } });
  const original = [new HumanMessage("Historical material " + "x".repeat(24000)), new HumanMessage("Change the component")], before = JSON.stringify(original);
  const result = await window.project(original, []);
  expect(window.stats.compactions).toBeGreaterThan(0);
  expect(result.some(message => typeof message.content === "string" && message.content.includes("export const stable = 1"))).toBe(true);
  expect(JSON.stringify(original)).toBe(before);
  const projected = [...logs].reverse().find((item: any) => item.event === "context_projection");
  expect(projected).toMatchObject({ projectedEstimatedTokens: expect.any(Number), workingContextEstimatedTokens: expect.any(Number) });
  expect(projected.projectedEstimatedTokens).toBeLessThanOrEqual(6000);
});

it("keeps a custom component and Service contract ahead of its navigation metadata", () => {
  const { ctx, hashes } = context();
  const files = ["src/card/definition.ts", "src/card/manifest.json", "src/card/Card.tsx", "src/services/card.ts"];
  ctx.editingSelection = { target: { id: "plugin-source:card", kind: "plugin_source", name: "Card", entryPath: files[0]! }, identity: "project", guards: "guard", filePaths: files };
  for (const [index, file] of files.entries()) {
    hashes.set(file, { hash: String(index) }); ctx.readRanges!.set(file, [{ hash: String(index), start: 1, end: 1 }]);
    rememberSourceRead(ctx, { path: "/" + file, hash: String(index), content: "1: " + ["definition metadata", "manifest metadata", "CARD_COMPONENT_STATE", "CARD_SERVICE_CONTRACT"][index], totalLines: 1, nextOffset: null }, 0);
  }
  const projected = JSON.parse(String(workingSourceContext(ctx, 1800)[0]!.content).split("\n").slice(1).join("\n"));
  expect(projected.files.slice(0, 2).map((file: any) => file.path)).toEqual(["src/card/Card.tsx", "src/services/card.ts"]);
  expect(projected.files.every((file: any) => file.readInCurrentRun)).toBe(true);
  hashes.set("src/card/Card.tsx", { hash: "changed" });
  expect(String(workingSourceContext(ctx, 1800)[0]!.content)).not.toContain("CARD_COMPONENT_STATE");
});

it("keeps an actual approved development plan outside a summary claiming approval is unknown", async () => {
  const { workingContext } = await import("../src/agent/working-context.js");
  const { ctx } = context();
  ctx.authorizedPlugins = new Set(["dismiss"]);
  ctx.pluginPlans = new Map([["dismiss", { status: "authorized", scopeHash: "bound-plan", contract: { capability: "Add dismiss control", lifecycle: "subscribe and return cleanup" }, workKind: "create-plugin", evidence: {}, desiredOutcome: "Add dismiss control", missingCapabilities: ["No existing dismiss API"] }]]);
  const window = new CreatorContextWindow({ environment: { CREATOR_CONTEXT_MAX_TOKENS: "6000", CREATOR_CONTEXT_KEEP_TOKENS: "500", CREATOR_MODEL_MAX_TOKENS: "512" },
    request: "Add dismiss", signal: () => new AbortController().signal,
    workingContext: budget => workingContext(ctx, budget), model: () => ({ invoke: async () => new AIMessage("Historical summary: approval is unknown.") }) as any, log: async () => {} });
  const messages = await window.project([new HumanMessage("old material ".repeat(4000)), new HumanMessage("Add dismiss")], []);
  expect(window.stats.compactions).toBeGreaterThan(0);
  const host = messages.find(message => typeof message.content === "string" && message.content.startsWith("Host current development decisions"));
  expect(host?.content).toContain('"confirmedNewPlugins":["dismiss"]'); expect(host?.content).not.toContain("bound-plan");
  expect(host?.content).toContain("subscribe and return cleanup");
  expect(estimateMessageTokens(workingContext(ctx, 800))).toBeLessThanOrEqual(800);
});

it("keeps only observed API signatures across compaction with version and evidence boundaries", () => {
  const { ctx } = context();
  const sharedTypes = { status: "available", module: "@za38.03/agent-ui-plugins", packageVersion: "1.2.3",
    symbols: [{ name: "usePluginEvents", status: "available", type: "() => UIPluginEvents", truncated: false },
      { name: "GuessedAPI", status: "unavailable" }] };
  const result = { application: { sharedTypes }, asset: { implementation: "irrelevant inventory".repeat(3000) } };
  rememberPublicApiRead(ctx, result);
  const messages = workingPublicApiContext(ctx, 700);
  expect(String(messages[0]!.content)).toContain("1.2.3");
  expect(String(messages[0]!.content)).toContain("() => UIPluginEvents");
  expect(String(messages[0]!.content)).not.toContain("GuessedAPI");
  expect(String(messages[0]!.content)).toContain("re-inspect after dependency changes");
  expect(estimateMessageTokens(messages)).toBeLessThanOrEqual(700);
  expect(projectPublicApiRead(result, "reference")).toMatchObject({ sharedTypes, projection: { referenceOnly: true } });
  expect(JSON.stringify(projectPublicApiRead(result, "reference"))).not.toContain("irrelevant inventory");
  expect(workingPublicApiContext(ctx, 20)).toEqual([]);
  rememberPublicApiRead(ctx, { sharedTypes: { ...sharedTypes, symbols: [{ name: "usePluginEvents", status: "unavailable" }] } });
  expect(workingPublicApiContext(ctx, 700)).toEqual([]);
  rememberPublicApiRead(ctx, { sharedTypes: { ...sharedTypes, packageVersion: "2.0.0",
    symbols: [{ name: "ChangedAPI", status: "available", type: "() => number" }] } });
  const refreshed = String(workingPublicApiContext(ctx, 700)[0]!.content);
  expect(refreshed).toContain("2.0.0"); expect(refreshed).not.toContain("1.2.3"); expect(refreshed).not.toContain("usePluginEvents");
});
it("preserves project ownership and the minimal grant even when implementation prose is oversized", () => {
  const { ctx } = context();
  ctx.pluginOwnerships = new Map([["card", { pluginId: "card", entryPath: "src/plugins/card/definition.ts", assetOwnership: "project_source", implementationOwnership: "project" }]]);
  ctx.authorizedPlugins = new Set(["dismiss"]);
  ctx.pluginPlans = new Map([["dismiss", { status: "authorized", scopeHash: "confirmed", workKind: "create-plugin", contract: {}, evidence: {}, desiredOutcome: "中文".repeat(2000), missingCapabilities: ["缺口".repeat(2000)] }]]);
  // State survives even when full descriptive fields cannot all fit.
  const messages = workingDevelopmentContext(ctx, 750);
  expect(messages).toHaveLength(1);
  expect(String(messages[0]!.content)).toContain('"confirmedNewPlugins":["dismiss"]');
  expect(String(messages[0]!.content)).toContain('"implementationTakeoverRequired":false');
  expect(estimateMessageTokens(messages)).toBeLessThanOrEqual(750);
});

it("pins the selected custom component ahead of later unrelated reads when its entry is definition.ts", () => {
  const { ctx, hashes } = context();
  const owner = "src/card/index.tsx";
  ctx.editingSelection = { target: { id: "card", kind: "plugin_source", name: "Card", entryPath: "src/card/definition.ts" }, identity: "p", guards: "g", filePaths: ["src/card/definition.ts", owner] };
  for (const file of [owner, ...Array.from({ length: 8 }, (_, i) => `src/other-${i}/index.tsx`)]) {
    hashes.set(file, { hash: file }); ctx.readRanges!.set(file, [{ hash: file, start: 1, end: 1 }]);
    rememberSourceRead(ctx, { path: "/" + file, hash: file, content: "1: export const value = 1;", totalLines: 1, nextOffset: null }, 0);
  }
  expect(JSON.parse(String(workingSourceContext(ctx, 1000)[0]!.content).split("\n")[1]!).files[0].path).toBe(owner);
});

it("retains the custom component ahead of CSS even when styles were discovered first and later reads fill the cache", () => {
  const { ctx, hashes } = context();
  const directory = "src/应用/plugins/card/", owner = directory + "index.tsx", styles = directory + "styles.css";
  ctx.editingSelection = { target: { id: "card", kind: "plugin_source", name: "Card", entryPath: directory + "definition.ts" },
    identity: "p", guards: "g", filePaths: [directory + "definition.ts", directory + "manifest.json", styles, owner] };
  for (const file of [styles, owner, ...Array.from({ length: 20 }, (_, i) => `src/other-${i}/index.tsx`)]) {
    hashes.set(file, { hash: file }); ctx.readRanges!.set(file, [{ hash: file, start: 1, end: 30 }]);
    rememberSourceRead(ctx, { path: "/" + file, hash: file, content: Array.from({ length: 30 }, (_, i) => `${i + 1}: ${file} state_${i}`).join("\n"), totalLines: 30, nextOffset: null }, 0);
  }
  const files = JSON.parse(String(workingSourceContext(ctx, 1000)[0]!.content).split("\n")[1]!).files;
  expect(files[0].path).toBe(owner); expect(files[0].content).toContain("state_0");
  expect(ctx.sourceSnapshots!.has(owner)).toBe(true);
  expect(estimateMessageTokens(workingSourceContext(ctx, 1000))).toBeLessThanOrEqual(1000);
});

it("keeps an actually observed complete source after a narrower same-hash reread, but replaces it when content changes", () => {
  const { ctx, hashes } = context(), file = "src/界面/index.tsx";
  hashes.set(file, { hash: "read-hash" });
  rememberSourceRead(ctx, { path: "/" + file, hash: "read-hash", content: "2: export default stable;", totalLines: 2, nextOffset: null }, 1);
  expect(ctx.sourceSnapshots!.get(file)).toMatchObject({ start: 1, end: 2, truncated: false });
  expect(String(workingSourceContext(ctx, 1000)[0]!.content)).toContain("export const stable");
  hashes.set(file, { hash: "new-hash" }); ctx.readRanges!.set(file, [{ hash: "new-hash", start: 1, end: 1 }]);
  rememberSourceRead(ctx, { path: "/" + file, hash: "new-hash", content: "1: export const changed = 2;", totalLines: 1, nextOffset: null }, 0);
  const content = String(workingSourceContext(ctx, 1000)[0]!.content);
  expect(content).toContain("changed = 2"); expect(content).not.toContain("export default stable");
});
