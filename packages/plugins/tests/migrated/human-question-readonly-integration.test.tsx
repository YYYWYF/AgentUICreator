// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ReadonlyThreadProvider } from "@assistant-ui/react";
import { afterEach, expect, it, vi } from "vitest";
import { useConversationCanAnswerToolCall } from "../../src/index";
import { AskUserQuestionToolUI } from "../../../source-registry/registry/items/demo-ask-user-question/files/agent-ui/conversation/human-tool-uis/ask-user-question";

const labels = { back: "Back", next: "Next", submit: "Submit", submitting: "Submitting", answered: "Selected", noneSelected: "No selection", unavailable: "Unavailable" };
vi.mock("../../../source-registry/registry/items/foundation-core-adapters/files/agent-ui/i18n/useAgentUILocale", () => ({
  useAgentUILocale: () => labels,
}));

const roots: Root[] = [];
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
async function render(element: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(element));
  return host;
}
afterEach(async () => {
  await act(async () => roots.splice(0).forEach(root => root.unmount()));
  document.body.replaceChildren();
});

it("connects the public answer capability to a real readonly assistant-ui thread", async () => {
  let canAnswer: boolean | undefined;
  function Probe() {
    canAnswer = useConversationCanAnswerToolCall();
    return null;
  }
  const addResult = vi.fn();
  const host = await render(<ReadonlyThreadProvider messages={[]}>
    <Probe />
    <AskUserQuestionToolUI
      toolCallId="call-1" toolName="ask_user_question"
      args={{ steps: [{ id: "layout", question: "Layout?", options: [{ id: "dashboard", label: "Dashboard" }, { id: "chat", label: "Chat" }], selectionMode: "single", minSelections: 1, maxSelections: 1 }] }}
      status={{ type: "requires-action" }} addResult={addResult}
    />
  </ReadonlyThreadProvider>);
  expect(canAnswer).toBe(false);
  expect(host.textContent).toContain("Layout?");
  expect(host.textContent).toContain("Dashboard");
  expect(host.querySelector("button")).toBeNull();
  expect(addResult).not.toHaveBeenCalled();
});
