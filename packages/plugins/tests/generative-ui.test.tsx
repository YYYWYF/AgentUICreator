import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { z } from "zod";
import { createAgentUIGenerativeUI, createAgentUIGenerativeActions } from "../src/generative-ui";

it("extends defaults, overrides a default component, and dispatches custom actions", async () => {
  const received = vi.fn();
  const ui = createAgentUIGenerativeUI({ components: {
    OrderCard: { description: "Order", properties: z.object({ id: z.string() }), render: ({ id }) => <article data-order={id}>{id}</article> },
    Button: { description: "Custom button", properties: z.object({ label: z.string() }), render: ({ label, $dispatch, $action }) => <button data-custom="true" onClick={() => $action && $dispatch?.($action)}>{label}</button> },
  }, actions: createAgentUIGenerativeActions({ "a2ui:action": ({ payload }) => received(payload) }) });
  const Render = ui.present().render!;
  const args = [{ $type: "OrderCard", id: "order-42" }, { $type: "Button", label: "Confirm", $action: { type: "a2ui:action", id: "order-42" } }, { $type: "Markdown", value: "**default still works**" }];
  const props = { args, status: { type: "complete", reason: "stop" } } as any;
  const html = renderToStaticMarkup(<Render {...props} />);
  expect(html).toContain('data-order="order-42"');
  expect(html).toContain('data-custom="true"');
  expect(html).toContain("<strong>default still works</strong>");
  const element = document.createElement("div"); const root = createRoot(element);
  await act(async () => root.render(<Render {...props} />));
  await act(async () => element.querySelector("button")!.click());
  expect(received).toHaveBeenCalledWith({ type: "a2ui:action", id: "order-42" });
  await act(async () => root.unmount());
});

it("keeps the deferred A2UI compatibility entry inert", async () => {
  const { createAgentUIA2ui } = await import("../src/experimental/a2ui");
  const handler = vi.fn();
  const Render = createAgentUIA2ui({ actions: createAgentUIGenerativeActions({ "a2ui:action": handler }) }).present().render!;
  expect(renderToStaticMarkup(<Render {...({ args: { $type: "Button", label: "Hidden" }, status: { type: "complete" }, toolCallId: "a2ui:orders", artifact: { a2ui: [] } } as any)} />)).toBe("");
  expect(handler).not.toHaveBeenCalled();
});
