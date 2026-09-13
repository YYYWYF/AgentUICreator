import type {
  ToolCallMessagePartComponent,
  ToolCallMessagePartProps,
} from "@assistant-ui/react";
import { MessagePartPrimitive, MessagePrimitive } from "@assistant-ui/react";
import { useState } from "react";

import { MarkdownText } from "../../../../vendor/assistant-ui/components/assistant-ui/elements/markdown-text";
import { Reasoning } from "../../../../vendor/assistant-ui/components/assistant-ui/elements/reasoning.aui";
import { ToolFallback } from "../../../../vendor/assistant-ui/components/assistant-ui/elements/tool-fallback.aui";
import { ToolCall } from "../../../../vendor/assistant-ui/components/assistant-ui/elements/tool-call";

type MockInvokeResearcherArgs = Record<string, unknown>;

function formatResult(result: unknown): string {
  if (result === null || result === undefined) return "";
  if (typeof result === "object" && "summary" in result) {
    const summary = (result as { summary?: unknown }).summary;
    if (typeof summary === "string") return summary;
  }
  try {
    return JSON.stringify(result) ?? String(result);
  } catch {
    return String(result);
  }
}

function shouldUseFallback(
  props: ToolCallMessagePartProps<MockInvokeResearcherArgs, unknown>,
): boolean {
  return props.isError === true ||
    props.status.type === "requires-action" ||
    props.status.type === "incomplete";
}

export function AssistantUiNestedMessage() {
  return (
    <MessagePrimitive.Root
      data-slot="mock-nested-assistant-message"
      data-role="assistant"
      className="border-border/50 bg-card/40 my-2 rounded-xl border px-3 py-2"
    >
      <MessagePrimitive.Parts
        components={{
          Text: MarkdownText,
          Reasoning,
          tools: { Fallback: ToolFallback },
        }}
      />
    </MessagePrimitive.Root>
  );
}

export const MockInvokeResearcherToolUI: ToolCallMessagePartComponent<
  MockInvokeResearcherArgs,
  unknown
> = (props) => {
  const [open, setOpen] = useState(false);
  if (shouldUseFallback(props)) return <ToolFallback {...props} />;

  return (
    <div
      data-slot="mock-invoke-researcher-tool"
      data-status={props.status.type}
      className="my-3 w-full max-w-xl rounded-2xl border border-border/60 bg-card/30 px-3 py-2"
    >
      <ToolCall
        activeLabel="Delegating to Researcher"
        label="Researcher completed"
        query="Architecture Researcher"
        request={props.argsText}
        result={formatResult(props.result)}
        running={props.status.type === "running"}
        open={open}
        onOpenChange={setOpen}
      />
      <section
        data-slot="mock-nested-subagent-conversation"
        aria-label="Architecture Researcher conversation"
        className="border-border/50 mt-2 border-s-2 ps-3"
      >
        <div className="text-foreground/70 mb-1 text-xs font-medium">
          Architecture Researcher
        </div>
        <MessagePartPrimitive.Messages>
          {() => <AssistantUiNestedMessage />}
        </MessagePartPrimitive.Messages>
      </section>
    </div>
  );
};
