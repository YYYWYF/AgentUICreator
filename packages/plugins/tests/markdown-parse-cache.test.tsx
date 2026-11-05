import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { expect, it, vi } from "vitest";
import { createMarkdownParseCache } from "../src/shared/markdown/markdown-parse-cache";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { AssistantRuntimeProvider, useLocalRuntime } from "@assistant-ui/react";
import { TextMessagePartProvider } from "@assistant-ui/core/react";
import { MarkdownText } from "../src/internal/adapters-generated/assistant-ui/components/assistant-ui/elements/markdown-text";
import { AgentUILocaleProvider } from "../src/locale";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";

it("parses equal deferred frames once and keeps GFM and code output", () => {
  const parsed = vi.fn();
  const countParser: ReturnType<typeof createMarkdownParseCache> = function () {
    const parse = this.parser!;
    this.parser = (text, file) => { parsed(text); return parse(text, file); };
  };
  const plugins = [remarkGfm, countParser, createMarkdownParseCache()];
  const text = "| Type | Days |\n| --- | --- |\n| Leave | 3 |\n\n```ts\nconst days = 3;\n```";
  const render = (value: string) => renderToStaticMarkup(<ReactMarkdown remarkPlugins={plugins}>{value}</ReactMarkdown>);
  const first = render(text);
  expect(render(text)).toBe(first);
  expect(parsed).toHaveBeenCalledTimes(1);
  expect(first).toContain("<table>");
  expect(first).toContain('class="language-ts"');
  expect(render(text + "\n\nFinal answer")).toContain("Final answer");
  expect(parsed).toHaveBeenCalledTimes(2);
  // A replacement/cold entry must also replace the cached text.
  expect(render("Different thread")).toContain("Different thread");
  expect(parsed).toHaveBeenCalledTimes(3);
});

it("isolates render transforms from the cached tree", () => {
  const append: ReturnType<typeof createMarkdownParseCache> = () => tree => {
    const children = Reflect.get(tree, "children") as unknown[];
    children.push({ type: "paragraph", children: [{ type: "text", value: "appended" }] });
  };
  const plugins = [remarkGfm, createMarkdownParseCache(), append];
  const render = () => renderToStaticMarkup(<ReactMarkdown remarkPlugins={plugins}>Original</ReactMarkdown>);
  expect(render()).toBe("<p>Original</p>\n<p>appended</p>");
  expect(render()).toBe("<p>Original</p>\n<p>appended</p>");
});

it("reuses a frozen parse tree through the fixed GFM pipeline without writes", () => {
  const freeze: ReturnType<typeof createMarkdownParseCache> = () => tree => {
    const pending: object[] = [tree];
    while (pending.length) {
      const value = pending.pop()!;
      if (Object.isFrozen(value)) continue;
      pending.push(...Object.values(value).filter((child): child is object => typeof child === "object" && child !== null));
      Object.freeze(value);
    }
  };
  const plugins = [remarkGfm, createMarkdownParseCache({ readOnly: true }), freeze];
  const text = "# Heading\n\n[policy][ref] and ~~old~~ https://example.com\n\n- [x] Complete\n- [ ] Pending\n\n| Type | Days |\n| --- | ---: |\n| Leave | 3 |\n\n```ts\nconst days = 3;\n```\n\nFootnote[^a]\n\n[^a]: Note\n\n[ref]: https://example.com/policy";
  const render = (value: string) => renderToStaticMarkup(<ReactMarkdown remarkPlugins={plugins}>{value}</ReactMarkdown>);
  const expected = renderToStaticMarkup(<ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>);
  expect(render(text)).toBe(expected);
  expect(render(text)).toBe(expected);
  const next = text + "\n\nFinal answer";
  expect(render(next)).toBe(renderToStaticMarkup(<ReactMarkdown remarkPlugins={[remarkGfm]}>{next}</ReactMarkdown>));
});

it("keeps native language renderers and replaces text after a part switch", async () => {
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  function Host({ text, revision = "" }: { text: string; revision?: string }) {
    const runtime = useLocalRuntime({ async *run() {} });
    const componentsByLanguage = { ts: {
      CodeHeader: ({ language }: { language: string }) => <span data-test-language>{language}{revision}</span>,
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

it("keeps cached blocks connected to the unified locale context", async () => {
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
