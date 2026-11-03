import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { RunActivity } from "../src/agent/activity.js";
import { prepareServiceImplementation, applyServiceImplementation } from "../src/agent/service-implementation-tools.js";
import { createTools, visibleTool, type ToolContext } from "../src/agent/tools.js";

const state = vi.hoisted(() => ({ decision: undefined as string | undefined, resumeAnswers: undefined as Record<string, string[]> | undefined, prompts: [] as any[], topology: { services: [] as any[] } }));
vi.mock("../src/agent/operator.js", async original => ({ ...await original<typeof import("../src/agent/operator.js")>(), requestOperator: vi.fn(async () => state.topology) }));
vi.mock("@langchain/langgraph", async original => ({ ...await original<typeof import("@langchain/langgraph")>(), interrupt: vi.fn((payload: any) => {
  state.prompts.push(payload);
  if (!state.decision) throw Object.assign(new Error("Awaiting real user response"), { name: "TestInterrupt" });
  return { answers: state.resumeAnswers ?? { [payload.steps[0].id]: [state.decision] } };
}) }));
const roots: string[] = [];
const relative = "services/conversations/http-data-source.ts";
const source = "src/应用";
const target = `${source}/${relative}`;
const canonical = fileURLToPath(new URL("../../plugins/resources/registry/items/foundation/core-application/files/services/conversations/", import.meta.url));
const edit = { oldText: 'deleteUrl: (base: string, id: string) => `${base}/conversations/${encodeURIComponent(id)}`', newText: 'deleteUrl: (base: string, id: string) => `${base}/history/${encodeURIComponent(id)}`' };
const proposal = { implementationPath: relative, edits: [edit], impactSummary: "只修改删除单条历史会话的路径。所有使用此数据源的删除调用生效；保留列表、详情、鉴权和公共契约。" };

beforeEach(() => { state.decision = undefined; state.resumeAnswers = undefined; state.prompts = []; state.topology = { services: [] }; });
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "Creator service 中文 ")); roots.push(root);
  await mkdir(path.join(root, ".agent-ui"));
  await mkdir(path.join(root, source, "services/conversations"), { recursive: true });
  await mkdir(path.join(root, source, "plugins/conversation-data-source"), { recursive: true });
  await writeFile(path.join(root, ".agent-ui/project.json"), JSON.stringify({ sourceRoot: source }));
  await writeFile(path.join(root, "package.json"), '{"type":"module"}');
  for (const name of ["http-data-source.ts", "contract.ts", "data-source.ts"]) await writeFile(path.join(root, source, "services/conversations", name), await readFile(path.join(canonical, name)));
  await writeFile(path.join(root, source, "plugins/conversation-data-source/definition.ts"), 'import { createHttpConversationDataSource } from "../../services/conversations/http-data-source.js"; export default createHttpConversationDataSource;');
  const signal = new AbortController().signal;
  const context: ToolContext = { root, threadId: "history-delete", skills: root, contracts: fileURLToPath(new URL("../contracts/creator", import.meta.url)),
    activity: new RunActivity(root, "delete-1", signal), signal, readOnly: false, userMessage: "配置删除某一条历史会话的接口", groups: new Set(["services"]),
    authorizedPlugins: new Set(), approvedServices: new Set(), diagnostics: new Map(), verificationMode: "static_only",
    validation: { ensureBaseline: vi.fn(async () => ({})) } as any };
  await context.activity.observations.observe(target);
  return context;
}

it("shows exact edits and statically derived consumers, waits without writing, then applies only the confirmed deletion change", async () => {
  const context = await fixture();
  const original = await readFile(path.join(context.root, target), "utf8");
  // A request to configure an API does not bypass the actual confirmation.
  await expect(prepareServiceImplementation(context, proposal)).rejects.toThrow("Awaiting real user");
  expect(await readFile(path.join(context.root, target), "utf8")).toBe(original);
  const description = JSON.parse(state.prompts[0].steps[0].description);
  expect(description).toMatchObject({ edits: [edit], impactSummary: proposal.impactSummary, affectedPlugins: ["conversation-data-source"] });
  expect(description.affectedFiles).toContain(`${source}/plugins/conversation-data-source/definition.ts`);
  state.decision = "approve";
  const plan = await prepareServiceImplementation(context, proposal);
  expect(plan.status).toBe("authorized");
  expect(await readFile(path.join(context.root, target), "utf8")).toBe(original);
  const result = await applyServiceImplementation(context, { authorizationId: ("authorizationId" in plan ? plan.authorizationId! : "missing") });
  expect(result).toMatchObject({ status: "applied", changedPaths: [target] });
  expect(await readFile(path.join(context.root, target), "utf8")).toBe(original.replace(edit.oldText, edit.newText));
  expect(context.approvedServices.size).toBe(0);
  await expect(applyServiceImplementation(context, { authorizationId: ("authorizationId" in plan ? plan.authorizationId! : "missing") })).rejects.toThrow("AUTHORIZATION_REQUIRED");

  // Execute the edited, real HTTP template against a mocked transport.
  const bundled = await build({ entryPoints: [path.join(context.root, target)], bundle: true, write: false, format: "esm", platform: "node",
    alias: {
      zod: fileURLToPath(import.meta.resolve("zod")),
      "@za38.03/agent-ui-runtime/ui/services/conversations/contract": fileURLToPath(import.meta.resolve("@za38.03/agent-ui-runtime/ui/services/conversations/contract")),
    } });
  const implementation = await import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(bundled.outputFiles![0]!.text).toString("base64")}`);
  const fetch = vi.fn(async () => new Response(null, { status: 204 }));
  const dataSource = implementation.createHttpConversationDataSource({ endpoint: "https://business.test/api/", fetch });
  await dataSource.delete("会话/a b");
  expect(fetch).toHaveBeenCalledWith(`https://business.test/api/history/${encodeURIComponent("会话/a b")}`, expect.objectContaining({ method: "DELETE", credentials: "same-origin" }));
  fetch.mockResolvedValueOnce(new Response('{"error":"denied"}', { status: 403 }));
  await expect(dataSource.delete("other")).rejects.toThrow("403");
});

it("declining records cancellation and leaves the implementation untouched", async () => {
  const context = await fixture(); state.decision = "decline";
  const original = await readFile(path.join(context.root, target), "utf8");
  expect(await prepareServiceImplementation(context, proposal)).toMatchObject({ status: "declined" });
  expect(context.executionDecision?.status).toBe("user_cancelled");
  expect(await readFile(path.join(context.root, target), "utf8")).toBe(original);
  expect(context.activity.revision).toBe(0);
});

it.each(["file", "consumer", "topology"])("requires replanning when %s changes after confirmation", async kind => {
  const context = await fixture(); state.decision = "approve";
  const plan = await prepareServiceImplementation(context, proposal);
  if (kind === "file") await writeFile(path.join(context.root, target), (await readFile(path.join(context.root, target), "utf8")) + "\n// external change\n");
  if (kind === "consumer") await writeFile(path.join(context.root, source, "plugins/conversation-data-source/definition.ts"), 'import "../../services/conversations/http-data-source.js"; export const changed = true;');
  if (kind === "topology") state.topology.services.push({ name: "agent-ui.other", contractPaths: [] });
  await expect(applyServiceImplementation(context, { authorizationId: ("authorizationId" in plan ? plan.authorizationId! : "missing") })).rejects.toThrow(/STALE|CHANGED_EXTERNALLY|stale-version/);
  expect(await readFile(path.join(context.root, target), "utf8")).toContain(edit.oldText);
});

it("keeps public contract paths and declarations on the contract channel", async () => {
  const context = await fixture(); state.decision = "approve";
  state.topology.services.push({ name: "agent-ui.conversation-data-source", contractPaths: [target.replaceAll("/", "\\")] });
  await expect(prepareServiceImplementation(context, proposal)).rejects.toThrow("SERVICE_CONTRACT_TOOL_REQUIRED");
  state.topology.services = [];
  await expect(prepareServiceImplementation(context, { ...proposal, edits: [{ oldText: "endpoint: string;", newText: "endpoint: number;" }] })).rejects.toThrow("SERVICE_CONTRACT_TOOL_REQUIRED");
  expect(state.prompts).toHaveLength(0);
});

it.each(["services/../runtime/private.ts", "services\\conversations\\http-data-source.ts", "services/C:/secret.ts", "services/vendor/helper.ts", "services/conversations/types.d.ts", "plugins/history/index.tsx"])("rejects invalid or protected logical path %s", async implementationPath => {
  const context = await fixture();
  await expect(prepareServiceImplementation(context, { ...proposal, implementationPath })).rejects.toThrow("PATH_INVALID");
});

it("cannot use read-only mode, a different run or invented approval", async () => {
  const context = await fixture();
  context.readOnly = true;
  await expect(prepareServiceImplementation(context, proposal)).rejects.toThrow("TOOL_PERMISSION_DENIED");
  await expect(applyServiceImplementation(context, { authorizationId: "invented" })).rejects.toThrow("TOOL_PERMISSION_DENIED");
  context.readOnly = false; state.decision = "approve";
  const plan = await prepareServiceImplementation(context, proposal);
  const other = await fixture();
  await expect(applyServiceImplementation(other, { authorizationId: ("authorizationId" in plan ? plan.authorizationId! : "missing") })).rejects.toThrow("AUTHORIZATION_REQUIRED");
});

it("exposes the supported implementation tools but keeps generic service writes protected", async () => {
  const context = await fixture();
  const tools = await createTools(context);
  for (const name of ["prepare_ui_service_implementation_change", "apply_ui_service_implementation_change"]) {
    expect(tools.some(tool => tool.name === name)).toBe(true);
    expect(visibleTool(name, context)).toBe(true);
  }
  await expect(context.hostTools!.get("edit_file")!({ file_path: `/${target}`, old_string: edit.oldText, new_string: edit.newText })).rejects.toThrow("SERVICE_AUTHORIZATION_REQUIRED");
});

it("resolves configured import aliases and forward-slash paths with Windows-style sourceRoot metadata", async () => {
  const context = await fixture(); state.decision = "approve";
  await writeFile(path.join(context.root, ".agent-ui/project.json"), JSON.stringify({ sourceRoot: source.replaceAll("/", "\\") }));
  await writeFile(path.join(context.root, "tsconfig.json"), JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/应用/*"] } }, include: ["src/**/*"] }));
  await writeFile(path.join(context.root, source, "plugins/conversation-data-source/definition.ts"), 'import { createHttpConversationDataSource } from "@/services/conversations/http-data-source"; export default createHttpConversationDataSource;');
  const plan = await prepareServiceImplementation(context, proposal);
  expect(JSON.parse(state.prompts[0].steps[0].description).affectedPlugins).toEqual(["conversation-data-source"]);
  expect(await applyServiceImplementation(context, { authorizationId: ("authorizationId" in plan ? plan.authorizationId! : "missing") })).toMatchObject({ status: "applied" });
});

it("requires a new proposal rather than treating stale resumed answers as cancellation", async () => {
  const context = await fixture();
  await expect(prepareServiceImplementation(context, proposal)).rejects.toThrow("Awaiting real user");
  const oldStep = state.prompts[0].steps[0].id;
  await writeFile(path.join(context.root, source, "plugins/conversation-data-source/definition.ts"), 'import "../../services/conversations/http-data-source.js"; export const modified = true;');
  state.decision = "approve"; state.resumeAnswers = { [oldStep]: ["approve"] };
  await expect(prepareServiceImplementation(context, proposal)).rejects.toThrow("SERVICE_IMPLEMENTATION_PLAN_STALE");
  expect(context.executionDecision).toBeUndefined();
  expect(context.activity.revision).toBe(0);
});
