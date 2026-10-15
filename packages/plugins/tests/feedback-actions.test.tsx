// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { AssistantRuntimeProvider, useLocalRuntime, type AssistantRuntime, type FeedbackAdapter } from "@assistant-ui/react";
import { describe, expect, it, vi } from "vitest";
import { ConversationThread, ConversationCanonicalResponseFeedbackActions } from "../src/public.js";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
function Footer() { return <ConversationCanonicalResponseFeedbackActions helpful="Helpful" notHelpful="Not helpful" />; }
async function fixture(feedback?: FeedbackAdapter) {
  let runtime!: AssistantRuntime;
  function App() {
    runtime = useLocalRuntime({ async *run() {} }, {
      adapters: { ...(feedback ? { feedback } : {}) },
      initialMessages: [
        { id: "user", role: "user", content: [{ type: "text", text: "question" }] },
        { id: "head", role: "assistant", content: [{ type: "text", text: "first" }] },
        { id: "tail", role: "assistant", content: [{ type: "text", text: "last" }] },
      ],
    });
    return <AssistantRuntimeProvider runtime={runtime}><ConversationThread components={{ AssistantResponseFooter: Footer }} composer={null} /></AssistantRuntimeProvider>;
  }
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  await act(async () => root.render(<App />));
  return { container, get runtime() { return runtime; }, dispose: async () => { await act(async () => root.unmount()); container.remove(); } };
}
describe("native response feedback actions", () => {
  it("hides buttons without persistence", async () => {
    const f = await fixture(); try { expect(f.container.querySelector('[aria-label="Helpful"]')).toBeNull(); } finally { await f.dispose(); }
  });
  it("selects feedback on the response tail using native pressed/submitted attributes", async () => {
    const submit = vi.fn(); const f = await fixture({ submit });
    try {
      for (const [label, type] of [["Helpful", "positive"], ["Not helpful", "negative"]] as const) {
        const button = f.container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
        expect(button).not.toBeNull();
        await act(async () => button.click());
        expect(submit).toHaveBeenLastCalledWith(expect.objectContaining({ message: expect.objectContaining({ id: "tail" }), type }));
        expect(button.getAttribute("aria-pressed")).toBe("true");
        expect(button.hasAttribute("data-submitted")).toBe(true);
        expect(f.runtime.thread.getMessageById("tail").getState().metadata.submittedFeedback).toEqual({ type });
        expect(f.runtime.thread.getMessageById("head").getState().metadata.submittedFeedback).toBeUndefined();
      }
    } finally { await f.dispose(); }
  });
});
