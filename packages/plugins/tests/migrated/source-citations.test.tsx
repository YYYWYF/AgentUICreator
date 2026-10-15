// @vitest-environment jsdom

import { AssistantRuntimeProvider, MessagePrimitive, ThreadPrimitive, useLocalRuntime, type ChatModelAdapter, type ThreadMessageLike } from "@assistant-ui/react";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ConversationSource, ConversationThread, TooltipProvider, type ConversationSourcePart, type ConversationToolCallProps } from "../../src/index.js";
import plugin from "../../../source-registry/registry/items/plugin-source-citations-message/files/plugins/source-citations-message/definition";
import { SearchSourcesToolUI } from "../../../source-registry/registry/items/plugin-source-citations-message/files/plugins/source-citations-message/index";
import { projectSourceCitationsResult } from "../../../source-registry/registry/items/plugin-source-citations-message/files/plugins/source-citations-message/source-citations-result";

const url = { sourceType: "url", id: "react-19", url: "https://react.dev/blog/2024/12/05/react-19", title: "React 19" } as const;
const documentSource = { sourceType: "document", id: "migration-guide", title: "Internal migration guide", mediaType: "application/pdf", filename: "migration-guide.pdf" } as const;
const result = { sources: [url, documentSource] };
const roots: Root[] = [];
const model: ChatModelAdapter = { run: async () => ({ content: [] }) };

async function render(element: ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(element));
  return container;
}
afterEach(async () => {
  await act(async () => roots.splice(0).forEach(root => root.unmount()));
  document.body.replaceChildren();
});

function NativeFixture({ source }: { source: ConversationSourcePart }) {
  const messages: ThreadMessageLike[] = [{ role: "assistant", content: [{ type: "source", ...source }], status: { type: "complete", reason: "stop" } }];
  const runtime = useLocalRuntime(model, { initialMessages: messages });
  return <AssistantRuntimeProvider runtime={runtime}><TooltipProvider>
    <ConversationThread autoFocus={false} composer={null} />
  </TooltipProvider></AssistantRuntimeProvider>;
}
function ToolFixture({ overrides = {} }: { overrides?: Partial<ConversationToolCallProps> }) {
  const runtime = useLocalRuntime(model, { initialMessages: [{ role: "assistant", content: [{
    type: "tool-call", toolCallId: "sources-1", toolName: "search_sources", args: {}, argsText: "{}", result,
  }] }] });
  function AssistantMessage() {
    return <MessagePrimitive.Root><MessagePrimitive.Parts components={{ tools: { by_name: {
      search_sources: props => <SearchSourcesToolUI {...props} {...overrides} />,
    } } }} /></MessagePrimitive.Root>;
  }
  return <AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Root>
    <ThreadPrimitive.Messages components={{ AssistantMessage, UserMessage: () => null }} />
  </ThreadPrimitive.Root></AssistantRuntimeProvider>;
}
function expectSource(container: HTMLElement, source: ConversationSourcePart) {
  expect(container.querySelector('[data-slot="source-title"]')?.textContent).toBe(source.title);
  if (source.sourceType === "url") {
    const link = container.querySelector<HTMLAnchorElement>('a[data-slot="source"]');
    expect(link?.getAttribute("href")).toBe(source.url);
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
  } else {
    expect(container.querySelector('[data-slot="source-document-icon"] svg')).not.toBeNull();
    expect(container.querySelector('a[data-slot="source"]')).toBeNull();
  }
}

describe("canonical native SourceMessagePart", () => {
  it.each([url, documentSource])("renders $sourceType in the default ConversationThread", async source => {
    const container = await render(<NativeFixture source={source} />);
    expect(container.querySelector('[data-slot="aui_assistant-message-parts"] [data-slot="source"]')).not.toBeNull();
    expectSource(container, source);
  });
});

describe("ConversationSource facade", () => {
  it.each([url, documentSource])("preserves official $sourceType Source DOM without a runtime", async source => {
    expectSource(await render(<ConversationSource {...source} />), source);
  });
});

describe("search_sources Tool-local projector", () => {
  it("projects URL and document fields and drops unrelated fields", () => {
    expect(projectSourceCitationsResult({ sources: [{ ...url, extra: true }, documentSource], extra: true })).toEqual(result.sources);
    expect(projectSourceCitationsResult({ sources: [{ ...url, url: "http://example.test/source" }] })?.[0]).toEqual({ ...url, url: "http://example.test/source" });
    expect(projectSourceCitationsResult({ sources: [{ sourceType: "url", id: "u", url: url.url }, { sourceType: "document", id: "d", title: "Guide", mediaType: "text/plain" }] })).toHaveLength(2);
  });
  it("accepts an empty sources result", () => {
    expect(projectSourceCitationsResult({ sources: [] })).toEqual([]);
  });
  it.each([null, [], "sources", {}, { sources: {} }, { sources: [null] },
    { sources: [{ ...url, id: " " }] }, { sources: [{ ...url, title: 1 }] },
    { sources: [{ ...url, sourceType: "unknown" }] }, { sources: [url, url] },
    { sources: [{ ...documentSource, title: " " }] }, { sources: [{ ...documentSource, mediaType: undefined }] },
    { sources: [{ ...documentSource, id: undefined }] }, { sources: [{ ...documentSource, filename: 1 }] },
  ])("rejects invalid result %j", value => {
    expect(projectSourceCitationsResult(value)).toBeNull();
  });
  it.each(["javascript:alert(1)", "data:text/html,unsafe", "not-a-url", "https:example.test", "https://", "file:///guide.pdf"])("rejects unsafe or malformed URL %s", unsafe => {
    expect(projectSourceCitationsResult({ sources: [documentSource, { ...url, url: unsafe }] })).toBeNull();
  });
});

describe("named backend Sources UI", () => {
  it("registers only render-only standalone search_sources", () => {
    expect(plugin.toolkit).toEqual({ search_sources: { type: "backend", display: "standalone", render: SearchSourcesToolUI } });
    expect(plugin.toolkit?.search_sources).not.toHaveProperty("execute");
  });
  it("renders successful sources with official elements", async () => {
    const container = await render(<ToolFixture />);
    expect(container.querySelectorAll('[data-slot="source"]')).toHaveLength(2);
    expect(container.querySelector('[data-slot="tool-fallback-root"]')).toBeNull();
  });
  it("renders zero Sources for a successful empty result", async () => {
    const container = await render(<ToolFixture overrides={{ result: { sources: [] } }} />);
    expect(container.querySelector('[data-slot="source"]')).toBeNull();
    expect(container.querySelector('[data-slot="tool-fallback-root"]')).toBeNull();
  });
  it.each([
    { result: {} }, { result: { sources: [{ ...url, url: "javascript:alert(1)" }] } },
    { status: { type: "running" as const } }, { status: { type: "requires-action" as const } },
    { status: { type: "incomplete" as const, reason: "cancelled" } }, { isError: true },
  ])("preserves official fallback for %j", async overrides => {
    const container = await render(<ToolFixture overrides={overrides} />);
    expect(container.querySelector('[data-slot="tool-fallback-root"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="source"]')).toBeNull();
  });
});
