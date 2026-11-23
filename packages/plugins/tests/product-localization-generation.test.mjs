import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { applyProductLocalization, prepareProductAdapters } from "../scripts/sync-product-adapters.mjs";

it.each([
  ["web-search", "web-search"],
  ["reasoning", "reasoning.aui"],
  ["conversation-suggestions", "follow-up-suggestions.aui"],
])("regenerates the reduced %s presentation API without changing upstream source", async (plugin, name) => {
  const localPath = `components/assistant-ui/elements/${name}.tsx`;
  const directory = new URL(`../src/plugins/${plugin}/`, import.meta.url);
  const vendor = new URL(`upstream/assistant-ui/${localPath}`, directory);
  const original = await readFile(vendor, "utf8");
  const generated = (await prepareProductAdapters()).files.find(file => file.localPath === localPath);
  const maintained = await readFile(new URL(`adapters/presentation/assistant-ui/${localPath}`, directory), "utf8");
  expect(generated.source).toBe(maintained);
  expect(await readFile(vendor, "utf8")).toBe(original);
});

it("regenerates all repeated presentation seams and preserves protocol results", async () => {
  const first = await prepareProductAdapters();
  const second = await prepareProductAdapters();
  expect(second).toEqual(first);
  const bridge = first.files.find(file => file.localPath.endsWith("/tool-fallback.aui.tsx")).source;
  expect(bridge).toContain("plugins/tool-result/adapters/presentation/tool-call-card.js");
  const approvalRoot = new URL("../src/plugins/tool-result/adapters/presentation/approval/", import.meta.url);
  const model = await readFile(new URL("approval-model.ts", approvalRoot), "utf8");
  const interaction = await readFile(new URL("use-approval-interaction.ts", approvalRoot), "utf8");
  expect(model).toContain("const APPROVED_RESULT = 'Approved by user'");
  expect(model).toContain("const DENIED_RESULT = 'User denied tool execution'");
  expect(interaction).toContain('respondToApproval({ approved, ...typedNote() })');
  for (const filename of ["approval.tsx", "approval-actions.tsx", "approval-options.tsx", "approval-receipt.tsx"]) {
    expect(await readFile(new URL(filename, approvalRoot), "utf8")).not.toMatch(/\n\s+(Allow|Deny|Confirm|Dismiss)\n/);
  }
  const tasks = first.files.find(file => file.localPath.endsWith("/agent-status.aui.tsx")).source;
  expect(tasks.match(/summaryLabel\(summary, localeMessages.tasks\)/g)).toHaveLength(2);
  const attachment = first.files.find(file => file.localPath.endsWith("/attachment.aui.tsx")).source;
  expect(attachment).toContain("text-white after:pointer-events-none hover:bg-black/70!");
  expect(attachment).not.toContain("after:-inset-1.5");
});

it("rejects a changed upstream localization anchor instead of silently skipping it", async () => {
  const path = "components/assistant-ui/elements/tool-group.aui.tsx";
  const clean = await readFile(new URL(`../src/internal/vendor-generated/assistant-ui/${path}`, import.meta.url), "utf8");
  expect(() => applyProductLocalization(clean.replace('`${count} tool ${count === 1 ? "call" : "calls"}`', '"new upstream label"'), path)).toThrow("Product localization anchor changed");
});

it.each(["button", "input"])("regenerates the React 18 %s ref adapter without changing upstream source", async name => {
  const localPath = `components/ui/${name}.tsx`;
  const owner = new URL(`../src/shared/upstream/assistant-ui/${localPath}`, import.meta.url);
  const clean = await readFile(owner, "utf8");
  const generated = (await prepareProductAdapters()).files.find(file => file.localPath === localPath);
  const maintained = await readFile(new URL(`../src/shared/adapters/presentation/assistant-ui/${localPath}`, import.meta.url), "utf8");
  expect(generated.source).toBe(maintained);
  expect(await readFile(owner, "utf8")).toBe(clean);
  const { applyProductAdaptations } = await import("../scripts/sync-product-adapters.mjs");
  expect(applyProductAdaptations(clean.replace(/\r?\n/g, "\r\n"), localPath)).toBe(applyProductAdaptations(clean.replace(/\r\n/g, "\n"), localPath));
});

it("preserves JSX elements, icons, slots and styles when localizing generated adapters", async () => {
  const { default: ts } = await import("typescript-ui-audit");
  const { applyProductAdaptations } = await import("../scripts/sync-product-adapters.mjs");
  const recipes = JSON.parse(await readFile(new URL("../scripts/product-localization-recipes.json", import.meta.url), "utf8"));
  const shape = source => {
    const ast = ts.createSourceFile("adapter.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const nodes = [];
    const visit = node => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const stableAttributes = node.attributes.properties
          .filter(prop => ts.isJsxAttribute(prop) && ["data-slot", "className", "asChild", "variant", "size"].includes(prop.name.text))
          .map(prop => prop.getText(ast));
        nodes.push({ tag: node.tagName.getText(ast), attributes: stableAttributes });
      }
      ts.forEachChild(node, visit);
    };
    visit(ast); return nodes;
  };
  for (const file of Object.keys(recipes)) {
    const vendor = await readFile(new URL(`../src/internal/vendor-generated/assistant-ui/${file}`, import.meta.url), "utf8");
    const adapted = applyProductAdaptations(vendor, file);
    const localized = applyProductLocalization(adapted, file);
    expect(shape(localized), file).toEqual(shape(adapted));
  }
});

it("adapts Thread List identity before applying presentation-only localization", async () => {
  const { applyProductAdaptations, THREAD_LIST_GROUP_IDENTITY_SEAM_ID } = await import("../scripts/sync-product-adapters.mjs");
  const path = "components/assistant-ui/elements/thread-list.aui.tsx";
  const vendor = await readFile(new URL(`../src/internal/vendor-generated/assistant-ui/${path}`, import.meta.url), "utf8");
  const adapted = applyProductAdaptations(vendor, path);
  expect(adapted).toContain("id: string; label: string");
  expect(adapted).toContain("const label = id;");
  expect(adapted).toContain("lastGroup?.id === id");
  expect(adapted).toContain("result.push({ id, label, indices: [index] });");
  expect(adapted).toContain("key={group.id}");
  expect(adapted).not.toContain("useLocale");
  const localized = applyProductLocalization(adapted, path);
  for (const anchor of ["id: string; label: string", "lastGroup?.id === id", "result.push({ id, label, indices: [index] });", "key={group.id}"]) expect(localized).toContain(anchor);
  expect(localized).toContain("Today: messages.today");
  expect(() => applyProductAdaptations(vendor.replace("lastGroup?.label === label", "lastGroup?.label === nextLabel"), path)).toThrow(THREAD_LIST_GROUP_IDENTITY_SEAM_ID);
});
