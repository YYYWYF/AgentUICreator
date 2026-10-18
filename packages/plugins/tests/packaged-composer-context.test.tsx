// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { AssistantRuntimeProvider, useLocalRuntime } from "@assistant-ui/react";
import { expect, it } from "vitest";
import { ConversationCanonicalComposer } from "../dist/index.js";
import { ConversationComposerLexicalInput } from "../dist/lexical.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it("published Lexical uses the shared Composer host Context, including custom labels", async () => {
  function Host() {
    const runtime = useLocalRuntime({ async *run() { yield { content: [{ type: "text" as const, text: "done" }] }; } });
    return <AssistantRuntimeProvider runtime={runtime}>
      <ConversationCanonicalComposer autoFocus={false} placeholder="host-placeholder" inputAriaLabel="host-input" input={<ConversationComposerLexicalInput />} />
    </AssistantRuntimeProvider>;
  }
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Host />));
    expect(container.querySelector('[contenteditable="true"]')?.getAttribute("aria-label")).toBe("host-input");
    expect(container.textContent).toContain("host-placeholder");
  } finally { await act(async () => root.unmount()); container.remove(); }
});

it("published Composer forwards application input and root props and preserves custom composition", async () => {
  const { ConversationComposerPlugin } = await import("../dist/composer/index.js");
  let runtime: ReturnType<typeof useLocalRuntime>;
  let runs = 0;
  let keys = 0;
  function Host() {
    runtime = useLocalRuntime({ async *run() { runs++; yield { content: [{ type: "text" as const, text: "done" }] }; } });
    return <AssistantRuntimeProvider runtime={runtime}>
      <ConversationComposerPlugin renderSlot={(_slot, fallback) => fallback} renderScopedSlot={() => null}
        rootProps={{ "aria-label": "custom-form" }} beforeInput={<span data-testid="application-before">custom</span>}
        inputProps={{ submitMode: "ctrlEnter", minRows: 2, maxRows: 8, placeholder: "custom-placeholder", "aria-label": "custom-input", onKeyDown: () => keys++ }} />
    </AssistantRuntimeProvider>;
  }
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Host />));
    expect(container.querySelector('form[aria-label="custom-form"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="application-before"]')).not.toBeNull();
    const input = container.querySelector('textarea[aria-label="custom-input"]')!;
    expect(input.getAttribute("placeholder")).toBe("custom-placeholder");
    await act(async () => runtime!.thread.composer.setText("application draft"));
    await act(async () => { input.dispatchEvent(new KeyboardEvent("keydown", {key:"Enter", bubbles:true, cancelable:true})); });
    expect(runs).toBe(0);
    await act(async () => { input.dispatchEvent(new KeyboardEvent("keydown", {key:"Enter", ctrlKey:true, bubbles:true, cancelable:true})); });
    expect(runs).toBe(1); expect(keys).toBe(2);
  } finally { await act(async () => root.unmount()); container.remove(); }
});
