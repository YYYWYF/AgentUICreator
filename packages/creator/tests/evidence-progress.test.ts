import { expect, it } from "vitest";
import { EvidenceProgress } from "../src/agent/evidence-progress.js";
import { isDirectPluginCommission } from "../src/agent/tools.js";

it("recognizes covered ranges despite changed limits, new empty keywords and unrelated repeated reads", () => {
  const progress = new EvidenceProgress();
  const file = { path: "/src/中文.tsx", hash: "first", totalLines: 80, nextOffset: null };
  expect(progress.observe("read_file", { offset: 0, limit: 200 }, file, 0).newEvidence).toBe(true);
  expect(progress.observe("read_file", { offset: 10, limit: 20 }, { ...file, nextOffset: 30 }, 0).newEvidence).toBe(false);
  let last: ReturnType<EvidenceProgress["observe"]>;
  for (let index = 0; index < 5; index++) last = progress.observe("grep", { path: "/src", pattern: `missing-${index}` }, [], 0);
  expect(last!).toMatchObject({ newEvidence: false, unchangedReads: 6, recovery: { action: "review_stalled_investigation" } });
  expect(progress.observe("read_file", {}, { ...file, hash: "changed" }, 0)).toMatchObject({ newEvidence: true, unchangedReads: 0 });
});
it("merges adjacent observations and resets feedback after actual mutation without limiting long progress", () => {
  const progress = new EvidenceProgress();
  const file = { path: "/src/a.ts", hash: "first", totalLines: 100 };
  progress.observe("read_file", { offset: 0 }, { ...file, nextOffset: 20 }, 0);
  progress.observe("read_file", { offset: 20 }, { ...file, nextOffset: 40 }, 0);
  expect(progress.observe("read_file", { offset: 5 }, { ...file, nextOffset: 35 }, 0).newEvidence).toBe(false);
  expect(progress.observe("grep", {}, [], 1)).toMatchObject({ unchangedReads: 1 });
  for (let i = 0; i < 120; i++) expect(progress.observe("grep", { pattern: String(i) }, [`/src/file-${i}.tsx`], 1)).toMatchObject({ newEvidence: true, unchangedReads: 0 });
});
it("ignores telemetry and query wording but retains different directory scope and changed facts", () => {
  const progress = new EvidenceProgress();
  expect(progress.observe("inspect_ui_plugin", { pluginId: "a" }, { asset: { id: "a" }, observedAt: "1" }, 0).newEvidence).toBe(true);
  expect(progress.observe("inspect_ui_plugin", { pluginId: "a", query: "again" }, { asset: { id: "a" }, observedAt: "2", recovery: { count: 9 } }, 0).newEvidence).toBe(false);
  expect(progress.observe("ls", { path: "/a" }, [{ name: "index.tsx" }], 0).newEvidence).toBe(true);
  expect(progress.observe("ls", { path: "/b" }, [{ name: "index.tsx" }], 0).newEvidence).toBe(true);
});
it.each([
  '给刚才的帮助卡片添加一个“知道了”按钮插件，放进 headerActions。点击后隐藏帮助内容，再次点击卡片标题能重新展开。切换主题后功能仍然正常。',
  'Add a button plugin to the help card',
  '新增一个按钮插件，不要修改 vendor 和 Runtime。',
])("retains explicit plugin commissions: %s", message => expect(isDirectPluginCommission(message)).toBe(true));
it.each(['不要添加新的插件，只分析', '是否新增一个按钮插件？', '先评估是否实现这个插件', 'Please do not add a new plugin', 'Should we add a new plugin?'])
  ("does not turn discussion or refusal into a commission: %s", message => expect(isDirectPluginCommission(message)).toBe(false));
