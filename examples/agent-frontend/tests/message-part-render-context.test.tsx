import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AgentMessage } from "../framework/contracts/ui-plugin";
import {
  MessageRenderProvider,
  useMessageAttachmentsRenderContext,
  useMessageSourcesRenderContext,
} from "../runtime/message-rendering";

const message: AgentMessage = {
  id: "message-part-context",
  producer: { type: "root" },
  role: "assistant",
  content: "Answer",
};

function AttachmentsConsumer() {
  const context = useMessageAttachmentsRenderContext();
  return <span>{`${context.kind}:${context.items[0]?.name}`}</span>;
}

function SourcesConsumer() {
  const context = useMessageSourcesRenderContext();
  return <span>{`${context.kind}:${context.items[0]?.title}`}</span>;
}

describe("Message Part render context", () => {
  it("exposes attachments only through the attachments hook", () => {
    const value = {
      kind: "attachments" as const,
      message,
      turnId: "turn-attachment",
      items: [{ key: "image", name: "image.png", kind: "image" as const }],
    };
    expect(renderToStaticMarkup(
      <MessageRenderProvider value={value}>
        <AttachmentsConsumer />
      </MessageRenderProvider>,
    )).toContain("attachments:image.png");
    expect(() => renderToStaticMarkup(
      <MessageRenderProvider value={value}>
        <SourcesConsumer />
      </MessageRenderProvider>,
    )).toThrow('Sources renderer received message render kind "attachments"');
  });

  it("exposes sources only through the sources hook", () => {
    const value = {
      kind: "sources" as const,
      message,
      turnId: "turn-source",
      items: [{ key: "docs", title: "Documentation" }],
    };
    expect(renderToStaticMarkup(
      <MessageRenderProvider value={value}>
        <SourcesConsumer />
      </MessageRenderProvider>,
    )).toContain("sources:Documentation");
    expect(() => renderToStaticMarkup(
      <MessageRenderProvider value={value}>
        <AttachmentsConsumer />
      </MessageRenderProvider>,
    )).toThrow('Attachments renderer received message render kind "sources"');
  });
});
