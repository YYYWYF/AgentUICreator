// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { AssistantRuntimeProvider, MessagePrimitive, ThreadPrimitive, useLocalRuntime, type ChatModelAdapter } from "@assistant-ui/react";
import { ConversationFile, type ConversationToolCallProps } from "../../src/index.js";
import plugin from "../../../source-registry/registry/items/plugin-generated-file-message/files/plugins/generated-file-message/definition";
import { GenerateFileToolUI } from "../../../source-registry/registry/items/plugin-generated-file-message/files/plugins/generated-file-message/index";
import { projectGeneratedFileResult } from "../../../source-registry/registry/items/plugin-generated-file-message/files/plugins/generated-file-message/generated-file-result";

const file = { filename: "quarterly-report.pdf", mimeType: "application/pdf", url: "https://example.com/generated/quarterly-report.pdf" };
const roots: Root[] = [];
const chatModel: ChatModelAdapter = { run: async () => ({ content: [] }) };
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Give the official fallback its normal message/part context, including elapsed time.
function ToolFixture({ element }: { element: ReactElement }) {
  const runtime = useLocalRuntime(chatModel, { initialMessages: [{ role: "assistant", content: [{
    type: "tool-call", toolCallId: "file-1", toolName: "generate_file", args: {}, argsText: "{}", result: file,
  }] }] });
  function AssistantMessage() {
    return <MessagePrimitive.Root><MessagePrimitive.Parts components={{ tools: { by_name: { generate_file: () => element } } }} /></MessagePrimitive.Root>;
  }
  return <AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Root>
    <ThreadPrimitive.Messages components={{ AssistantMessage, UserMessage: () => null }} />
  </ThreadPrimitive.Root></AssistantRuntimeProvider>;
}
async function render(element: ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(<ToolFixture element={element} />));
  return container;
}
function props(overrides: Partial<ConversationToolCallProps> = {}): ConversationToolCallProps {
  return { type: "tool-call", toolCallId: "file-1", toolName: "generate_file", args: {}, argsText: "{}", result: file,
    status: { type: "complete" }, addResult: () => undefined, resume: () => undefined,
    respondToApproval: async () => undefined, ...overrides };
}
afterEach(async () => {
  await act(async () => roots.splice(0).forEach(root => root.unmount()));
  document.body.replaceChildren();
});

describe("generate_file Tool-local projection and UI", () => {
  it("registers only a render-only standalone backend Tool", () => {
    expect(plugin.toolkit?.generate_file).toEqual({ type: "backend", display: "standalone", render: GenerateFileToolUI });
    expect(plugin.toolkit?.generate_file).not.toHaveProperty("execute");
  });
  it("projects only validated file fields", () => {
    expect(projectGeneratedFileResult({ ...file, extra: true })).toEqual(file);
    expect(projectGeneratedFileResult({ ...file, url: "http://example.test/report.pdf" })?.url).toBe("http://example.test/report.pdf");
  });
  it.each([null, [], "file", {}, { ...file, filename: " " }, { ...file, mimeType: 1 },
    { ...file, mimeType: " " }, { ...file, url: " " }, { ...file, url: "not-a-url" },
    { ...file, url: "https:example.com/report.pdf" },
    { ...file, url: "javascript:alert(1)" }, { ...file, url: "data:application/pdf;base64,JVBERg==" },
  ])("rejects malformed or unsupported result %j", result => {
    expect(projectGeneratedFileResult(result)).toBeNull();
  });
  it("renders a successful result with the official File element", async () => {
    const container = await render(<GenerateFileToolUI {...props()} />);
    expect(container.querySelector('[data-slot="file-root"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="tool-fallback-root"]')).toBeNull();
    expect(container.textContent).toContain(file.filename);
  });
  it.each([
    { result: { filename: "bad" } },
    { status: { type: "running" as const } },
    { status: { type: "incomplete" as const, reason: "cancelled" } },
    { status: { type: "requires-action" as const } },
    { status: { type: "incomplete" as const, reason: "error" }, isError: true },
    { isError: true },
  ])("preserves official ToolFallback for non-success state %j", async overrides => {
    const container = await render(<GenerateFileToolUI {...props(overrides)} />);
    expect(container.querySelector('[data-slot="tool-fallback-root"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="file-root"]')).toBeNull();
  });
});

describe("ConversationFile download DOM contract", () => {
  it("uses the PDF icon and official Download anchor without requesting the URL", async () => {
    const container = await render(<ConversationFile filename={file.filename} mimeType={file.mimeType} data={file.url} sourceType="url" />);
    expect(container.querySelector('[data-slot="file-name"]')?.textContent).toBe(file.filename);
    expect(container.querySelector('[data-slot="file-icon"] svg.lucide-file-text')).not.toBeNull();
    const link = container.querySelector<HTMLAnchorElement>('a[data-slot="file-download"]');
    expect(link?.getAttribute("aria-label")).toBe(`Download ${file.filename}`);
    expect(link?.getAttribute("href")).toBe(file.url);
    expect(link?.getAttribute("download")).toBe(file.filename);
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
  });
});
