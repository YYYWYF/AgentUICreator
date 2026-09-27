// @vitest-environment jsdom

import {
  AbstractAgent,
  type BaseEvent,
  type RunAgentInput,
} from "@ag-ui/client";
import {
  AssistantRuntimeProvider,
  AuiConfig,
  MessagePrimitive,
  ThreadPrimitive,
} from "@assistant-ui/react";
import {
  useAgUiRuntime,
  type AgUiAssistantRuntime,
} from "@assistant-ui/react-ag-ui";
import { markdownShowcaseScenario, runMockScenario } from "@agent-ui/mock-agent";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { from, type Observable } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConversationMarkdownText, TooltipProvider } from "../../src/index";

const roots: Root[] = [];
const config = AuiConfig({});

class MarkdownScenarioAgent extends AbstractAgent {
  override run(input: RunAgentInput): Observable<BaseEvent> {
    return from(runMockScenario(input, markdownShowcaseScenario, {
      timingScale: 0,
    }));
  }
}

function MarkdownMessage() {
  return (
    <MessagePrimitive.Root>
      <MessagePrimitive.Parts components={{ Text: ConversationMarkdownText }} />
    </MessagePrimitive.Root>
  );
}

const messageComponents = {
  AssistantMessage: MarkdownMessage,
  UserMessage: () => null,
};

function Fixture({ agent, onRuntime }: {
  agent: MarkdownScenarioAgent;
  onRuntime(runtime: AgUiAssistantRuntime): void;
}) {
  const runtime = useAgUiRuntime({ agent });
  onRuntime(runtime);
  return (
    <AssistantRuntimeProvider config={config} runtime={runtime}>
      <TooltipProvider>
        <ThreadPrimitive.Root>
          <ThreadPrimitive.Messages components={messageComponents} />
        </ThreadPrimitive.Root>
      </TooltipProvider>
    </AssistantRuntimeProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(async () => {
  await act(async () => {
    roots.splice(0).forEach((root) => root.unmount());
  });
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("Markdown Showcase through the existing conversation presentation", () => {
  it("renders Markdown / GFM text parts and existing code headers", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    let capturedRuntime: AgUiAssistantRuntime | undefined;
    const agent = new MarkdownScenarioAgent({ threadId: "markdown-thread" });
    await act(async () => {
      root.render(
        <Fixture agent={agent} onRuntime={(runtime) => { capturedRuntime = runtime; }} />,
      );
    });
    if (capturedRuntime === undefined) throw new Error("Runtime was not captured");
    const runtime = capturedRuntime;
    await act(async () => {
      void runtime.thread.append({
        role: "user",
        content: [{ type: "text", text: "Show Markdown" }],
        startRun: true,
      });
    });

    // The current Markdown primitive defers presentation by a frame.
    await vi.waitFor(async () => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      expect(runtime.thread.getState().isRunning).toBe(false);
      expect(container.querySelectorAll(".aui-code-header-root")).toHaveLength(2);
    });

    const assistantMessages = runtime.thread.getState().messages.filter(
      ({ role }) => role === "assistant",
    );
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0]?.status).toMatchObject({ type: "complete" });
    const tags = [
      "h1", "h2", "h3", "h4", "h5", "h6", "strong", "em", "del",
      "blockquote", "ul", "ol", "hr", "table", "th", "td", "code", "pre", "a",
    ];
    for (const tag of tags) {
      expect(container.querySelector(tag), `missing ${tag}`).not.toBeNull();
    }
    const inlineCode = container.querySelector(".aui-md-inline-code");
    expect(inlineCode).not.toBeNull();
    expect(inlineCode?.textContent).toBe("inline code");
    expect(container.querySelector(".aui-md-p")).not.toBeNull();
    expect(container.querySelector("ul ul")).not.toBeNull();
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
    expect(container.querySelector('input[type="checkbox"]:checked')).not.toBeNull();
    expect(container.querySelector<HTMLTableCellElement>("thead th:nth-child(2)")?.style.textAlign)
      .toBe("center");
    expect(container.querySelector<HTMLTableCellElement>("tbody td:nth-child(3)")?.style.textAlign)
      .toBe("right");
    expect(container.querySelector("a")?.getAttribute("href")).toBe("https://example.com");
    expect(container.querySelectorAll("pre code")).toHaveLength(2);
    expect([...container.querySelectorAll(".aui-code-header-language")].map(
      (node) => node.textContent,
    )).toEqual(["ts", "json"]);
    for (const header of container.querySelectorAll(".aui-code-header-root")) {
      expect(header.querySelector("button")?.textContent).toContain("Copy");
    }
    expect(container.querySelector("pre")?.textContent).toContain("const longLine =");
  });
});
