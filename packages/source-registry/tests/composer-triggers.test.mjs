import { expect, it, vi } from "vitest";
import { createConversationCommandRegistry } from "../registry/items/foundation-core-application/files/services/composer-triggers.ts";
import { createDemoMentionSource } from "../registry/items/demo-composer-triggers/files/plugins/composer-trigger-demo/source.ts";
import { loadAgentUISourceRegistry, resolveAgentUISourceItemClosure } from "../src/index.ts";

it("publishes stable command snapshots and removes only each registration's own entry", () => {
  const registry = createConversationCommandRegistry();
  const changed = vi.fn();
  const unsubscribe = registry.subscribe(changed);
  const initial = registry.getSnapshot();
  expect(registry.getSnapshot()).toBe(initial);
  const remove = registry.register({ id: "new", label: "New", mode: "action", execute() {} });
  expect(registry.getSnapshot()).not.toBe(initial);
  expect(() => registry.register({ id: "new", label: "Other", mode: "directive" })).toThrow();
  remove();
  const removeReplacement = registry.register({ id: "new", label: "Replacement", mode: "directive" });
  remove();
  expect(registry.getSnapshot()[0].label).toBe("Replacement");
  removeReplacement(); unsubscribe();
  expect(registry.getSnapshot()).toEqual([]);
  expect(changed).toHaveBeenCalledTimes(4);
});

it("keeps the asynchronous roster explicit, localized and cancellable", async () => {
  const source = createDemoMentionSource();
  source.setItems([{ id: "employee_84721", type: "user", label: "张三" }], "zh-CN");
  const controller = new AbortController();
  const pending = source.search({ query: "张", signal: controller.signal });
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  await expect(source.search({ query: "张", signal: new AbortController().signal })).resolves.toEqual([
    { id: "employee_84721", type: "user", label: "张三" },
  ]);
  source.setItems([{ id: "employee_84721", type: "user", label: "Zhang" }], "en-US");
  expect(source.cacheKey).toContain("demo-roster:en-US:");
});

it("resolves independent trigger plugins without implicitly installing demonstration data", async () => {
  const registry = await loadAgentUISourceRegistry();
  for (const id of ["plugin/assistant-ui-mention-trigger", "plugin/assistant-ui-slash-command-trigger", "plugin/conversation-command-source"]) {
    expect(resolveAgentUISourceItemClosure(registry, id).some(item => item.kind === "demo")).toBe(false);
  }
  expect(resolveAgentUISourceItemClosure(registry, "demo/composer-triggers").map(item => item.id)).toContain("plugin/conversation-command-source");
});
