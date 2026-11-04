import { afterEach, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readCreatorDocumentation } from "../src/agent/documentation.js";
import { createTools, visibleTool, type ToolContext } from "../src/agent/tools.js";
import { RunActivity } from "../src/agent/activity.js";
import { EvidenceProgress } from "../src/agent/evidence-progress.js";

const roots: string[] = [];
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "Creator 文档 空格 ")); roots.push(root);
  const text = '# 插件接口\r\nINTRO_SENTINEL\r\n## 服务订阅\r\nusePluginServiceSnapshot()\r\n`provides`\r\n' + '状态🌟订阅\r\n'.repeat(1000) + '## 子插槽\r\nrenderScopedSlot()\r\nSLOT_SENTINEL';
  const service = text.indexOf('## 服务'), slot = text.indexOf('## 子');
  const documents = [{ id: "public:development/plugin-api", source: "public", topic: "开发文档", title: "插件接口", summary: "Service、子插槽", path: "development/plugin-api.md", sha256: digest(text),
    sections: [{ id: "s1", title: "插件接口", level: 1, start: 0, end: text.length }, { id: "s3", title: "服务订阅", level: 2, start: service, end: slot }, { id: "s1005", title: "子插槽", level: 2, start: slot, end: text.length }] },
    ...Array.from({ length: 12 }, (_, i) => ({ id: `internal:reference-${i}`, source: "internal", topic: "职责", title: `Boundary ${i}`, summary: "Current ownership", path: `references/reference-${i}.md`, sha256: digest("# Boundary\nContract"), sections: [{ id: "s1", title: "Boundary", level: 1, start: 0, end: 19 }] }))];
  for (const document of documents) {
    const file = path.join(root, ...document.path.split("/"));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, document.source === "public" ? text : "# Boundary\nContract");
  }
  const catalog = JSON.stringify({ schemaVersion: 1, documents });
  const manifest = { schemaVersion: 1, packageName: "@za38.03/agent-ui-creator", packageVersion: "1.2.3", versions: { "@za38.03/agent-ui-creator": "1.2.3" }, sourceDigest: "a".repeat(64),
    files: [{ path: "agent-index.json", sha256: digest(catalog) }, ...documents.map(document => ({ path: document.path, sha256: document.sha256 }))] };
  await writeFile(path.join(root, "agent-index.json"), catalog);
  await writeFile(path.join(root, "index.json"), JSON.stringify(manifest));
  return { root, text, documents, manifest };
}

it("returns topic counts first and searchable metadata/section links without article bodies", async () => {
  const { root } = await fixture();
  const index = await readCreatorDocumentation({}, root);
  expect(index).toMatchObject({ status: "available", referenceOnly: true, totalDocuments: 13 });
  expect(JSON.stringify(index)).not.toContain("INTRO_SENTINEL");
  // This identifier appears only in a code example, not the title or summary.
  const found = await readCreatorDocumentation({ query: "usePluginServiceSnapshot" }, root);
  if (!("entries" in found)) throw new Error(JSON.stringify(found));
  expect(found.entries?.[0]?.documentId).toBe("public:development/plugin-api");
  expect(found.entries?.[0]?.matchingSections[0]).toMatchObject({ sectionId: "s3" });
  expect(JSON.stringify(found)).not.toContain("INTRO_SENTINEL");
  const toc = await readCreatorDocumentation({ action: "read", documentId: "public:development/plugin-api" }, root);
  if (!("sections" in toc)) throw new Error(JSON.stringify(toc));
  expect(toc.sections).toHaveLength(3); expect(JSON.stringify(toc)).not.toContain("SLOT_SENTINEL");
  const section = await readCreatorDocumentation({ action: "read", documentId: "public:development/plugin-api", sectionId: "s1005" }, root);
  if (!("content" in section)) throw new Error(JSON.stringify(section));
  expect(section.content).toContain("SLOT_SENTINEL"); expect(section.content).not.toContain("INTRO_SENTINEL");
});

it("paginates filtered indexes without omissions and reports unknown IDs or empty results honestly", async () => {
  const { root } = await fixture();
  const first = await readCreatorDocumentation({ source: "internal" }, root);
  if (!("entries" in first)) throw new Error(JSON.stringify(first));
  const second = await readCreatorDocumentation({ source: "internal", offset: first.nextOffset! }, root);
  if (!("entries" in second)) throw new Error(JSON.stringify(second));
  expect(first.entries).toHaveLength(8); expect(second.entries).toHaveLength(4); expect(second.nextOffset).toBeNull();
  expect(new Set([...first.entries!, ...second.entries!].map(entry => entry.documentId)).size).toBe(12);
  expect(await readCreatorDocumentation({ query: "not-present-identifier" }, root)).toMatchObject({ status: "available", total: 0, entries: [] });
  expect(await readCreatorDocumentation({ action: "read", documentId: "../../outside" }, root)).toMatchObject({ status: "not_found" });
  expect(await readCreatorDocumentation({ action: "read", documentId: "public:development/plugin-api", sectionId: "invented" }, root)).toMatchObject({ status: "not_found" });
});

it("reads exact CRLF/Unicode section pages within bounds and rejects invalid ranges", async () => {
  const { root, text } = await fixture();
  let offset: number | null = 0, content = "";
  while (offset !== null) {
    const page = await readCreatorDocumentation({ action: "read", documentId: "public:development/plugin-api", sectionId: "s3", offset, limit: 127 }, root);
    if (!("content" in page)) throw new Error(JSON.stringify(page));
    expect(page.content!.length).toBeLessThanOrEqual(127);
    expect(page.content).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/u);
    content += page.content; offset = page.nextOffset!;
  }
  expect(content).toBe(text.slice(text.indexOf("## 服务"), text.indexOf("## 子")));
  for (const input of [{ limit: 8001 }, { limit: 1 }, { offset: -1 }]) await expect(readCreatorDocumentation(input, root)).rejects.toThrow("RANGE_INVALID");
});

it("rejects missing, corrupt and changed resources without reading arbitrary files", async () => {
  const { root } = await fixture();
  expect(await readCreatorDocumentation({}, path.join(root, "missing"))).toMatchObject({ status: "unavailable" });
  await writeFile(path.join(root, "development/plugin-api.md"), "changed");
  expect(await readCreatorDocumentation({ action: "read", documentId: "public:development/plugin-api" }, root)).toMatchObject({ status: "invalid" });
  expect(await readCreatorDocumentation({ query: "Service" }, root)).toMatchObject({ status: "invalid" });
  await writeFile(path.join(root, "agent-index.json"), "{}");
  expect(await readCreatorDocumentation({}, root)).toMatchObject({ status: "invalid" });
});

it("rejects indexed symlinks outside the documentation root", async ({ skip }) => {
  const { root, text } = await fixture();
  const outside = await mkdtemp(path.join(tmpdir(), "Creator outside ")); roots.push(outside);
  await writeFile(path.join(outside, "private.md"), text);
  await rm(path.join(root, "development/plugin-api.md"));
  try { await symlink(path.join(outside, "private.md"), path.join(root, "development/plugin-api.md")); }
  catch (error) {
    if (process.platform === "win32" && ["EPERM", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) skip();
    else throw error;
  }
  expect(await readCreatorDocumentation({ action: "read", documentId: "public:development/plugin-api" }, root)).toMatchObject({ status: "invalid" });
});

it("exposes the real tool in read-only requests without granting mutation authority or source observations", async () => {
  const { root } = await fixture(), signal = new AbortController().signal;
  const contracts = fileURLToPath(new URL("../contracts/creator/", import.meta.url));
  const context: ToolContext = { root, documentationRoot: root, contracts, skills: root, activity: new RunActivity(root, "docs", signal), signal,
    readOnly: true, userMessage: "查询插件接口", threadId: "docs", groups: new Set(), authorizedPlugins: new Set(), diagnostics: new Map(), verificationMode: "static_only" };
  const tools = await createTools(context), tool = tools.find(tool => tool.name === "read_creator_documentation");
  expect(visibleTool(tool.name, context)).toBe(true);
  const output = JSON.parse(await tool.invoke({ query: "usePluginServiceSnapshot" }));
  expect(output).toMatchObject({ ok: true, result: { status: "available", referenceOnly: true } });
  expect(context.activity.before.size).toBe(0); expect(context.activity.observations.get("development/plugin-api.md")).toBeUndefined(); expect(context.readRanges).toBeUndefined();
  expect(context.authorizedPlugins.size).toBe(0);
  expect(context.blocker).toBeUndefined(); expect(context.evidenceRevision ?? 0).toBe(0);
  // Changing query wording to rediscover the same document is not progress.
  await tool.invoke({ query: "renderScopedSlot" });
  expect(context.evidenceRevision ?? 0).toBe(0);
  await tool.invoke(output.result.entries[0].matchingSections[0].nextRead.input);
  expect(context.evidenceRevision).toBe(1);
  expect(await readFile(path.join(root, "development/plugin-api.md"), "utf8")).toContain("INTRO_SENTINEL");
});

it("does not count differently worded empty documentation searches as new evidence", () => {
  const progress = new EvidenceProgress();
  expect(progress.observe("read_creator_documentation", { query: "first" }, { query: "first", entries: [] }, 0).newEvidence).toBe(false);
  expect(progress.observe("read_creator_documentation", { query: "second" }, { query: "second", entries: [] }, 0)).toMatchObject({ newEvidence: false, unchangedReads: 2 });
});

it("reads an ancestor introduction and child links rather than paging through the whole API book", async () => {
  const { root } = await fixture();
  const result = await readCreatorDocumentation({ action: "read", documentId: "public:development/plugin-api", sectionId: "s1" }, root);
  expect(result).toMatchObject({ nextOffset: null, childSections: [{ sectionId: "s3" }, { sectionId: "s1005" }] });
  if (!("content" in result)) throw new Error("missing section");
  expect(result.content).toContain("INTRO_SENTINEL");
  expect(result.content).not.toContain("usePluginServiceSnapshot");
});
it("gives an unknown custom Plugin the public API table of contents instead of unrelated document matches", async () => {
  const { root } = await fixture();
  const { editingDocumentation } = await import("../src/agent/documentation.js");
  const result = await editingDocumentation("quick-help-content", "", root);
  expect(result).toMatchObject({ status: "available", entries: [{ documentId: "public:development/plugin-api", matchingSections: [] }] });
});

it("ranks exact API identifiers above generic context titles and returns the answer section instead of its ancestor", async () => {
  const { root, documents, manifest } = await fixture();
  const distraction = documents[1]!, text = "# 上下文 context\n上下文 context 插件 子插件 children slot";
  Object.assign(distraction, { title: "上下文 context", summary: "上下文 context 子插件 children slot", sha256: digest(text),
    sections: [{ id: "s1", title: "上下文 context", level: 1, start: 0, end: text.length }] });
  await writeFile(path.join(root, ...distraction.path.split("/")), text);
  const catalog = JSON.stringify({ schemaVersion: 1, documents });
  manifest.files = [{ path: "agent-index.json", sha256: digest(catalog) }, ...documents.map(document => ({ path: document.path, sha256: document.sha256 }))];
  await writeFile(path.join(root, "agent-index.json"), catalog);
  await writeFile(path.join(root, "index.json"), JSON.stringify(manifest));
  const query = "renderScopedSlot 子插件 上下文 slot children";
  const result = await readCreatorDocumentation({ query }, root);
  expect(result).toHaveProperty("entries.0.documentId", "public:development/plugin-api");
  expect(result).toHaveProperty("entries.0.matchingSections.0.sectionId", "s1005");
  const { editingDocumentation } = await import("../src/agent/documentation.js");
  const editing = await editingDocumentation("quick-help-context", query, root);
  expect(editing).toHaveProperty("entries.0.documentId", "public:development/plugin-api");
  expect(editing).toHaveProperty("entries.0.matchingSections.0.sectionId", "s1005");
  expect(await readCreatorDocumentation({ query: "服务上下文 子插件 继承 provides" }, root)).toHaveProperty("entries.0.documentId", "public:development/plugin-api");
  // Generic context remains discoverable when it is the actual requested topic.
  expect(await readCreatorDocumentation({ query: "上下文 context" }, root)).toHaveProperty("entries.0.documentId", distraction.id);
});
