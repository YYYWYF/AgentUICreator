import { expect, it } from "vitest";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { rememberSourceRead, workingSourceContext } from "../src/agent/working-context.js";
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
  expect(projected.files.slice(0, 2).map((file: any) => file.path)).toEqual(["src/services/card.ts", "src/card/Card.tsx"]);
  expect(projected.files.every((file: any) => file.readInCurrentRun)).toBe(true);
  hashes.set("src/card/Card.tsx", { hash: "changed" });
  expect(String(workingSourceContext(ctx, 1800)[0]!.content)).not.toContain("CARD_COMPONENT_STATE");
});
