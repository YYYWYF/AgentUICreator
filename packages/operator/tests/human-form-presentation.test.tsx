// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { ConversationToolCallProps } from "@za38.03/agent-ui-react";
import { CollectUserDetailsToolUI } from "../../source-registry/registry/items/demo-human-form/files/agent-ui/conversation/human-tool-uis/collect-user-details";
import { PluginServiceRuntime, PluginServiceRuntimeContext } from "../../source-registry/registry/items/foundation-core-runtime/files/runtime/plugins";
import { agentUILocaleConfig } from "../../source-registry/registry/items/foundation-core-adapters/files/agent-ui/i18n/locale-config";
import { resolveLocaleNamespace } from "../../source-registry/registry/items/foundation-core-adapters/files/agent-ui/i18n/locale-registry";

vi.mock("@za38.03/agent-ui-react", async importOriginal => ({
  ...await importOriginal<typeof import("@za38.03/agent-ui-react")>(),
  useConversationCanAnswerToolCall: () => true,
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
afterEach(async () => { await act(async () => { roots.splice(0).forEach(root => root.unmount()); }); document.body.replaceChildren(); });
const labels = resolveLocaleNamespace(agentUILocaleConfig.defaultLocale, "frontendTools");
const props: ConversationToolCallProps = {
  toolCallId: "collect", toolName: "collect_user_details", args: {}, status: { type: "requires-action" }, addResult: vi.fn(async () => {}),
};
async function render(value: ConversationToolCallProps) {
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container); roots.push(root);
  await act(async () => root.render(<PluginServiceRuntimeContext.Provider value={new PluginServiceRuntime()}>
    <CollectUserDetailsToolUI {...value} />
  </PluginServiceRuntimeContext.Provider>));
  return container;
}
it("keeps an invalid blank form open without submitting", async () => {
  const addResult = vi.fn(async () => {});
  const container = await render({ ...props, addResult });
  expect(container.querySelectorAll("input, textarea")).toHaveLength(4);
  await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(addResult).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(labels.formInvalid);
});
it("shows submission progress during the continuation transition", async () => {
  const container = await render({ ...props, status: { type: "running" } });
  expect(container.querySelector('[role="status"]')?.textContent).toBe(labels.formBusy);
  expect(container.textContent).not.toContain(labels.formUnavailable);
});
it("renders submitted history as read-only without replaying the submission", async () => {
  const addResult = vi.fn(async () => {});
  const container = await render({ ...props, addResult, status: { type: "complete" }, result: {
    values: { firstName: "Bob", lastName: "Li", email: "bob@example.com", projectIdea: "Tasks" },
  } });
  expect(container.querySelectorAll("form, input, textarea, button")).toHaveLength(0);
  expect(container.textContent).toContain("bob@example.com");
  expect(addResult).not.toHaveBeenCalled();
});

it("submits validated values once through addResult and locks the receipt handoff", async () => {
  const addResult = vi.fn();
  const resumeInterrupt = vi.fn();
  const container = await render({ ...props, addResult, resumeInterrupt });
  for (const [name, value] of Object.entries({ firstName: " Bob ", lastName: " Li ", email: " bob@example.com ", projectIdea: "Tasks" })) {
    const input = container.querySelector(`[name="${name}"]`)!;
    const prototype = input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    await act(async () => {
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(addResult).toHaveBeenCalledExactlyOnceWith({ values: { firstName: "Bob", lastName: "Li", email: "bob@example.com", projectIdea: "Tasks" } });
  expect(resumeInterrupt).not.toHaveBeenCalled();
  expect(container.querySelector("fieldset")!.disabled).toBe(true);
  await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(addResult).toHaveBeenCalledTimes(1);
});

it("restores the form after a rejected tool result submission", async () => {
  const addResult = vi.fn(() => { throw new Error("Submission rejected"); });
  const container = await render({ ...props, addResult });
  for (const [name, value] of Object.entries({ firstName: "Bob", email: "bob@example.com" })) {
    const input = container.querySelector(`[name="${name}"]`)!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(labels.formUnavailable);
  expect(container.querySelector("fieldset")!.disabled).toBe(false);
});
