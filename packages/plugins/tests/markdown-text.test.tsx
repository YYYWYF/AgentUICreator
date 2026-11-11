import { expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { AssistantRuntimeProvider, useLocalRuntime } from "@assistant-ui/react";
import { TextMessagePartProvider } from "@assistant-ui/core/react";
import { MarkdownText } from "../src/internal/adapters-generated/assistant-ui/components/assistant-ui/elements/markdown-text";
import { AgentUILocaleProvider } from "../src/locale";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";

it("keeps native language renderers and replaces text after a part switch", async () => {
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  function Host({ text, revision = "" }: { text: string; revision?: string }) {
    const runtime = useLocalRuntime({ async *run() {} });
    const componentsByLanguage = { ts: {
      CodeHeader: ({ language }: { language?: string | undefined }) => <span data-test-language>{language}{revision}</span>,
      SyntaxHighlighter: ({ code }: { code: string }) => <pre data-test-code>{code}</pre>,
    } };
    return <AssistantRuntimeProvider runtime={runtime}>
      <TextMessagePartProvider text={text}>
        <div data-test-product><MarkdownText componentsByLanguage={componentsByLanguage} /></div>
        <div data-test-native><MarkdownTextPrimitive componentsByLanguage={componentsByLanguage} /></div>
      </TextMessagePartProvider>
    </AssistantRuntimeProvider>;
  }
  try {
    await act(async () => root.render(<Host text={"```ts\nconst days = 3;\n```\n\nFinal answer"} />));
    expect(element.querySelector("[data-test-language]")?.textContent).toBe("ts");
    expect(element.querySelector("[data-test-code]")?.textContent).toContain("const days = 3;");
    expect(element.textContent).toContain("Final answer");
    await act(async () => root.render(<Host text={"```ts\nconst days = 3;\n```\n\nFinal answer"} revision=" changed" />));
    expect(element.querySelector("[data-test-product] [data-test-language]")?.textContent)
      .toBe(element.querySelector("[data-test-native] [data-test-language]")?.textContent);
    await act(async () => root.render(<Host text="Different conversation" />));
    expect(element.querySelector("[data-test-product]")?.textContent).toBe("Different conversation");
    expect(element.querySelector("[data-test-code]")).toBeNull();
  } finally {
    await act(async () => root.unmount());
    element.remove();
  }
});

it("keeps Markdown connected to the unified locale context", async () => {
  function Host({ locale }: { locale: "en-US" | "zh-CN" }) {
    const runtime = useLocalRuntime({ async *run() {} });
    return <AssistantRuntimeProvider runtime={runtime}><AgentUILocaleProvider locale={locale}>
      <TextMessagePartProvider text={"```ts\nconst days = 3;\n```"}><MarkdownText /></TextMessagePartProvider>
    </AgentUILocaleProvider></AssistantRuntimeProvider>;
  }
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  try {
    await act(async () => root.render(<Host locale="en-US" />));
    expect(element.querySelector('[data-slot="agent-ui-code-header"] .sr-only')?.textContent).toBe("Copy");
    await act(async () => root.render(<Host locale="zh-CN" />));
    expect(element.querySelector('[data-slot="agent-ui-code-header"] .sr-only')?.textContent).toBe("复制");
    expect(element.querySelector("agent-ui-markdown-block")).toBeNull();
  } finally {
    await act(async () => root.unmount());
    element.remove();
  }
});

it("does not retain temporary fence characters after a code block closes", async () => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("prefers-reduced-motion"), media: query,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  }));
  function Host({ text }: { text: string }) {
    const runtime = useLocalRuntime({ async *run() {} });
    return <AssistantRuntimeProvider runtime={runtime}>
      <TextMessagePartProvider text={text}><MarkdownText /></TextMessagePartProvider>
    </AssistantRuntimeProvider>;
  }
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  try {
    await act(async () => root.render(<Host text={"```ts\nconst days = 3;\n``"} />));
    expect(element.querySelector("pre code")?.textContent).toContain("``");
    await act(async () => root.render(<Host text={"```ts\nconst days = 3;\n```\n\nFinal answer"} />));
    expect(element.querySelector("pre code")?.textContent).toBe("const days = 3;\n");
    expect(element.textContent).toContain("Final answer");
  } finally {
    await act(async () => root.unmount());
    element.remove();
    vi.unstubAllGlobals();
  }
});
