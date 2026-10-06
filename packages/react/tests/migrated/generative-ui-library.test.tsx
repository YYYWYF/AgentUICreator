// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { afterEach, expect, it, vi } from "vitest";
import { agentUIGenerativeUILibrary, createAgentUIGenerativeUI, createAgentUIGenerativeActions } from "../../../source-registry/registry/items/integration-generative-ui/files/integrations/generative-ui/index";
import { styledGenerativeUILibrary } from "../../../source-registry/registry/items/agent-component-assistant-ui-generative-ui/files/agent-ui/vendor/assistant-ui/generative-ui/styled-generative-ui";
import { generativeUIGallery } from "../../../project-control/tests/fixtures/generative-ui-gallery";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const disposers: (() => Promise<void>)[] = [];
afterEach(async () => { for (const dispose of disposers.splice(0)) await dispose(); });
async function render(spec: ToolCallMessagePartProps["args"], handler = vi.fn()) {
  const ui = createAgentUIGenerativeUI({ actions: createAgentUIGenerativeActions({ save: handler }) });
  const Render = ui.present().render!;
  const container = document.createElement("div"); container.className = "agent-ui-conversation"; document.body.append(container);
  const root = createRoot(container);
  const props = { type: "tool-call", toolName: "present", toolCallId: "gallery", args: spec, argsText: JSON.stringify(spec), result: {}, status: { type: "complete" }, addResult() {}, resume() {}, async respondToApproval() {} } satisfies ToolCallMessagePartProps<Record<string, unknown>, Record<string, never>>;
  await act(async () => { root.render(<Render {...props} />); });
  disposers.push(async () => { await act(async () => root.unmount()); container.remove(); });
  return { container, handler };
}

it("uses the official styled library and renders its supported vocabulary through JSONGenerativeUI", async () => {
  expect(agentUIGenerativeUILibrary).toBe(styledGenerativeUILibrary);
  const f = await render(generativeUIGallery);
  for (const name of ["Card", "Row", "Col", "Markdown", "Fact", "Badge", "Alert", "Table", "Chart", "Form", "Input", "Select", "Checkbox", "RadioGroup", "DatePicker", "Image", "Icon"]) {
    expect(agentUIGenerativeUILibrary[name], name).toBeDefined();
  }
  for (const name of ["card", "row", "col", "markdown", "fact", "badge", "alert", "table", "chart", "form", "input", "select", "checkbox", "radiogroup", "datepicker", "image", "icon"]) {
    expect(f.container.querySelector(`[data-aui="${name}"]`), name).not.toBeNull();
  }
  expect(f.container.querySelector("strong")?.textContent).toBe("bold");
  expect(f.container.querySelector("li")?.textContent).toBe("list");
  expect(f.container.querySelector("code")?.textContent).toBe("code");
});

it("renders the pinned Slider and CheckboxGroup capabilities with their initial values", async () => {
  const f = await render({ $type: "Col", children: [
    { $type: "Slider", label: "Quantity", min: 0, max: 10, defaultValue: 3 },
    { $type: "CheckboxGroup", label: "Extras", options: [{ label: "A", value: "a" }, { label: "B", value: "b" }], defaultValue: ["b"] },
  ] });
  expect(f.container.querySelector<HTMLInputElement>('input[type="range"]')!.value).toBe("3");
  expect(f.container.querySelector<HTMLInputElement>('input[type="checkbox"][value="a"]')!.checked).toBe(false);
  expect(f.container.querySelector<HTMLInputElement>('input[type="checkbox"][value="b"]')!.checked).toBe(true);
});

it("dispatches a Button action exactly once", async () => {
  const f = await render({ $type: "Button", label: "Save", $action: { type: "save" } });
  await act(async () => f.container.querySelector("button")!.click());
  expect(f.handler).toHaveBeenCalledTimes(1);
  expect(f.handler).toHaveBeenCalledWith({ payload: { type: "save" } });
});

it.each([
  [{ $type: "Input", label: "Note" }, "input", "Door", "keydown"],
  [{ $type: "Select", options: [{ label: "A", value: "a" }, { label: "B", value: "b" }] }, "select", "b", "change"],
  [{ $type: "Checkbox", label: "Transfer" }, 'input[type="checkbox"]', true, "click"],
  [{ $type: "RadioGroup", options: [{ label: "A", value: "a" }, { label: "B", value: "b" }] }, 'input[value="b"]', "b", "click"],
  [{ $type: "DatePicker", label: "Departure" }, 'input[type="date"]', "2026-10-10", "change"],
] as const)("passes official current control value into $input (%j)", async (spec, selector, value, event) => {
  const f = await render({ ...spec, $action: { type: "save", value: "model-value" } });
  const control = f.container.querySelector<HTMLInputElement | HTMLSelectElement>(selector)!;
  await act(async () => {
    if (event === "click") control.click();
    else {
      const prototype = control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(control, value);
      control.dispatchEvent(event === "keydown" ? new KeyboardEvent("keydown", { key: "Enter", bubbles: true }) : new Event("change", { bubbles: true }));
    }
  });
  expect(f.handler).toHaveBeenCalledTimes(1);
  expect(f.handler).toHaveBeenCalledWith({ payload: { type: "save", value: "model-value", $input: value } });
});

it("collects named controls through the official Form action", async () => {
  const f = await render({ $type: "Form", $action: { type: "save" }, children: [
    { $type: "Input", name: "note", label: "Note" },
    { $type: "Checkbox", name: "transfer", label: "Transfer", defaultChecked: true },
    { $type: "Button", label: "Save", submit: true },
  ] });
  await act(async () => {
    f.container.querySelector<HTMLInputElement>('input[name="note"]')!.value = "Door";
    f.container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(f.handler).toHaveBeenCalledTimes(1);
  expect(f.handler).toHaveBeenCalledWith({ payload: { type: "save", $input: { note: "Door", transfer: true } } });
});

it("initializes Input defaultValue and resolves $field from the current control value", async () => {
  const f = await render({ $type: "Col", children: [
    { $type: "Input", name: "note", defaultValue: "Door" },
    { $type: "Button", label: "Save", $action: { type: "save", note: { $field: "note" } } },
  ] });
  expect(f.container.querySelector<HTMLInputElement>("input")!.value).toBe("Door");
  await act(async () => {
    f.container.querySelector<HTMLInputElement>("input")!.value = "Current";
    f.container.querySelector("button")!.click();
  });
  // Field references are resolved at action time, after the user edits the input.
  expect(f.handler).toHaveBeenCalledWith({ payload: { type: "save", note: "Current" } });
});
