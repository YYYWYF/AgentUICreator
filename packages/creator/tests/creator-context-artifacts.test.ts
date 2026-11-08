import { expect, it } from "vitest";
import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { CreatorContextArtifacts } from "../src/agent/context-artifacts.js";
import { CreatorContextWindow, estimateMessageTokens } from "../src/agent/context-window.js";
const payload = JSON.stringify({ ok: true, result: { pluginId: "composer", declaration: "原始🌟 source\n".repeat(10000), manifest: { id: "composer", slots: ["testHint"] } } });
const message = () => new ToolMessage({ id: "original-message", content: payload, tool_call_id: "large-read" });
it("keeps complete editing-context archives with official/custom source and document navigation visible", () => {
  const value = { status: "resolved", target: { pluginId: "custom-card", entryPath: "src/plugins/custom-card/definition.ts" },
    files: [{ path: "/src/plugins/custom-card/index.tsx", hash: "source-hash", nextOffset: 120, content: "large source ".repeat(3000) }],
    plugin: { pluginId: "custom-card", implementationOwnership: "project", services: { provides: ["help.card"] }, manifest: { slots: { children: { body: {} } } } },
    references: { publicApi: { status: "available", propNames: ["maxLength", "renderSlot"], props: [{ name: "maxLength", type: "number" }] },
      sharedTypes: { status: "available", symbols: [{ name: "UIPluginRenderProps" }] },
      documentation: { status: "available", entries: [{ documentId: "public:development/plugin-api" }] } },
    coverage: { sourcesComplete: false, fileNavigation: [{ path: "other.ts", status: "unread" }] } };
  const artifacts = new CreatorContextArtifacts(), archived = artifacts.archive(new ToolMessage({ tool_call_id: "edit-context", content: JSON.stringify({ ok: true, result: value }) }), "inspect_ui_edit_context")!;
  const summary = JSON.parse(archived.message.content as string);
  expect(summary.editingNavigation).toMatchObject({ target: value.target, plugin: { services: value.plugin.services }, documentation: value.references.documentation });
  expect(summary.contracts[1]).toMatchObject({ path: ["result", "references", "publicApi"], value: { propNames: ["maxLength", "renderSlot"] } });
  expect(artifacts.read(archived.artifactId, ["result", "coverage"]).content).toContain("other.ts");
  expect(artifacts.read(archived.artifactId, ["result", "plugin", "manifest"]).content).toContain("body");
});
it("keeps the requested installed API visible while archiving an unrelated large inventory", () => {
  const sharedTypes = { status: "available", module: "@za38.03/agent-ui-runtime/ui", queryResolution: { status: "complete" },
    symbols: [{ name: "AgentProps.locales", status: "available", type: "AgentUILocaleOverrides | undefined", members: [] }] };
  const publicApi = { status: "available", component: "Composer", props: [{ name: "maxLength", type: "number | undefined" }], presentationContract: { interaction: "Uses composer.placeholder" } };
  const original = new ToolMessage({ tool_call_id: "api", content: JSON.stringify({ ok: true, result: { files: "irrelevant inventory ".repeat(2000), application: { sharedTypes, publicApi } } }) });
  const a = new CreatorContextArtifacts(), archived = a.archive(original, "inspect_ui_plugin")!;
  const preview = JSON.parse(archived.message.content as string);
  expect(preview.contracts[0]).toMatchObject({ path: ["result", "application", "sharedTypes"], previewOnly: true, value: sharedTypes });
  expect(preview.contracts[1].value.props).toEqual(publicApi.props);
  expect(a.read(archived.artifactId, ["result", "application", "sharedTypes"]).content).toContain("AgentProps.locales");
  expect(JSON.parse(original.content as string).result.application.sharedTypes).toEqual(sharedTypes);
});
it("preserves editing contracts ahead of large inherited props and supplies exact continuations", () => {
  const presentationContract = { styles: 'Use the scoped [data-slot="aui_composer-shell"] selector; inspect the actual borderRadius.', interaction: "Preserve draft and submit handlers." };
  const publicApi = { status: "available", component: "Composer", package: { name: "@za38.03/agent-ui-plugins", version: "3.2.1" }, presentationContract,
    localizedDefaults: { "inputProps.placeholder": "composer.placeholder" },
    propNames: Array.from({ length: 300 }, (_, i) => `onNativeEvent${i}`),
    props: Array.from({ length: 64 }, (_, i) => ({ name: `onNativeEvent${i}`, type: "Inherited DOM event type ".repeat(40) })) };
  const a = new CreatorContextArtifacts();
  const archived = a.archive(new ToolMessage({ tool_call_id: "composer-types", content: JSON.stringify({ ok: true, result: { application: { publicApi } } }) }), "inspect_ui_plugin")!;
  const output = JSON.parse(archived.message.content as string);
  expect(output.contracts[0].value).toMatchObject({ presentationContract, package: publicApi.package, localizedDefaults: publicApi.localizedDefaults });
  const link = output.contracts[0].detailReads.find((item: any) => item.field === "presentationContract").nextRead.input;
  expect(JSON.parse(a.read(link.artifactId, link.path).content)).toEqual(presentationContract);
  expect(() => a.read(archived.artifactId, ["result", "application", "presentationContract"])).toThrow(/availableKeys.*publicApi/);
});
it("reserves room for presentation guidance when shared signatures also need archiving", () => {
  const sharedTypes = { status: "available", module: "@za38.03/agent-ui-plugins", packageVersion: "3.2.1",
    symbols: Array.from({ length: 8 }, (_, i) => ({ name: `Type${i}`, type: "x".repeat(900), members: Array.from({ length: 12 }, (_, j) => ({ name: `member${j}`, type: "y".repeat(400) })) })) };
  const presentationContract = { styles: "Actual current project scoped selector ".repeat(30) };
  const a = new CreatorContextArtifacts(), archived = a.archive(new ToolMessage({ tool_call_id: "both", content: JSON.stringify({ ok: true, result: { application: { sharedTypes, publicApi: { status: "available", presentationContract } } } }) }), "inspect_ui_plugin")!;
  expect(JSON.parse(archived.message.content as string).contracts[1].value.presentationContract).toEqual(presentationContract);
  const largeComposition = a.archive(new ToolMessage({ tool_call_id: "large-composition", content: JSON.stringify({ ok: true, result: { application: { publicApi: { status: "available", presentationContract, compositionContract: { information: "x".repeat(30000) } } } } }) }), "inspect_ui_plugin")!;
  expect(JSON.parse(largeComposition.message.content as string).contracts[0].value.presentationContract).toEqual(presentationContract);
});
it("preserves exact snapshots with bounded JSON-path reads and run isolation", () => {
  const artifacts = new CreatorContextArtifacts(), original = message(), before = JSON.stringify(original);
  const archived = artifacts.archive(original, "inspect_ui_plugin")!;
  expect(archived.created).toBe(true); expect(archived.message.tool_call_id).toBe(original.tool_call_id);
  expect(JSON.stringify(original)).toBe(before);
  expect(artifacts.read(archived.artifactId, ["result", "manifest"]).content).toContain("testHint");
  expect(artifacts.read(archived.artifactId, ["result", "declaration"], 0, 13)).toMatchObject({ historical: true, grantsFreshness: false, offset: 0 });
  expect(artifacts.archive(original, "inspect_ui_plugin")!.created).toBe(false); expect(artifacts.size).toBe(1);
  expect(() => new CreatorContextArtifacts().read(archived.artifactId)).toThrow("CREATOR_CONTEXT_ARTIFACT_NOT_FOUND");
  expect(() => artifacts.read(archived.artifactId, ["constructor", "prototype"])).toThrow("CREATOR_CONTEXT_ARTIFACT_PATH_NOT_FOUND");
  expect(() => artifacts.read(archived.artifactId, [], 0, 8001)).toThrow("CREATOR_CONTEXT_ARTIFACT_RANGE_INVALID");
});
it("preserves Unicode exactly across bounded pages", () => {
  const artifacts = new CreatorContextArtifacts(), archived = artifacts.archive(message(), "read_file")!;
  let offset: number | null = 0, text = "";
  while (offset !== null) { const next = artifacts.read(archived.artifactId, ["result", "declaration"], offset, 7999); expect(next.content).not.toContain("\uFFFD"); text += next.content; offset = next.nextOffset; }
  expect(text).toBe(JSON.parse(payload).result.declaration);
});
it("rediscovers full snapshot IDs from a bounded run-local index after summaries abbreviate references", () => {
  const artifacts = new CreatorContextArtifacts(), archived = artifacts.archive(message(), "read_file")!;
  let offset: number | null = 0, text = "";
  while (offset !== null) { const next = artifacts.read("list", [], offset, 31); text += next.content; offset = next.nextOffset; }
  expect(JSON.parse(text)).toEqual([{ artifactId: archived.artifactId, originalTool: "read_file" }]);
  expect(artifacts.read("list")).toMatchObject({ historical: true, grantsFreshness: false, count: 1 });
  expect(new CreatorContextArtifacts().read("list")).toMatchObject({ count: 0, content: "[]" });
  expect(() => artifacts.read("list", ["unrelated"])).toThrow("CREATOR_CONTEXT_ARTIFACT_PATH_NOT_FOUND");
  expect(() => artifacts.read(archived.artifactId.slice(0, 12) + "…")).toThrow("CREATOR_CONTEXT_ARTIFACT_NOT_FOUND");
});
it.each(["mutate_app_ui_model", "prepare_ui_plugin_development", "inspect_creator_transaction", "inspect_ui_plugin_delivery", "inspect_runtime_errors"])("does not offload authority, mutation or validation evidence: %s", name => {
  const a = new CreatorContextArtifacts(); expect(a.archive(message(), name)).toBeUndefined(); expect(a.size).toBe(0);
});
it("does not offload failed observations", () => {
  const a = new CreatorContextArtifacts(); expect(a.archive(new ToolMessage({ tool_call_id: "error", content: JSON.stringify({ ok: false, error: { code: "SOURCE_FAILED", detail: "x".repeat(100000) } }) }), "inspect_ui_plugin")).toBeUndefined();
});
it("offloads before using a summary model, only when its reader is available", async () => {
  const original = [new HumanMessage("Inspect the existing Composer"), new AIMessage({ content: "", tool_calls: [{ name: "inspect_ui_plugin", args: {}, id: "large-read", type: "tool_call" }] }), message()];
  const window = new CreatorContextWindow({ environment: { CREATOR_CONTEXT_MAX_TOKENS: "6000", CREATOR_CONTEXT_KEEP_TOKENS: "500", CREATOR_MODEL_MAX_TOKENS: "512" }, request: "Inspect the existing Composer", signal: () => new AbortController().signal, model: () => { throw new Error("Summary model must not be called"); }, log: async () => {} });
  const reader = { type: "function", function: { name: "read_creator_context", parameters: { type: "object", properties: {} } } };
  const before = JSON.stringify(original); const result = await window.project(original, [reader]);
  expect(estimateMessageTokens(result) + 512).toBeLessThan(6000); expect(window.stats).toMatchObject({ summaryModelCalls: 0, offloadedArtifacts: 1 });
  const output = JSON.parse(result.find(m => ToolMessage.isInstance(m))!.content as string); expect(output.archived).toBe(true);
  expect(window.artifacts.read(output.artifactId, ["result", "manifest"]).content).toContain("composer");
  expect(JSON.stringify(original)).toBe(before);
});
