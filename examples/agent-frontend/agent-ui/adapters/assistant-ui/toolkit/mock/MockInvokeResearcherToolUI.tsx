import type {
  ToolCallMessagePartComponent,
  ToolCallMessagePartProps,
} from "@assistant-ui/react";
import { MessagePartPrimitive, MessagePrimitive } from "@assistant-ui/react";
import { useState } from "react";
import { CheckIcon, ChevronRightIcon, Loader2Icon } from "lucide-react";

import { MarkdownText } from "../../../../vendor/assistant-ui/components/assistant-ui/elements/markdown-text";
import { Reasoning } from "../../../../vendor/assistant-ui/components/assistant-ui/elements/reasoning.aui";
import { ToolFallback } from "../../../../vendor/assistant-ui/components/assistant-ui/elements/tool-fallback.aui";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../../../vendor/assistant-ui/components/ui/collapsible";

type MockInvokeResearcherArgs = Record<string, unknown>;

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
      className="my-2 min-w-0"
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
  const [open, setOpen] = useState(true);
  if (shouldUseFallback(props)) return <ToolFallback {...props} />;
  const running = props.status.type === "running";

  return (
    <Collapsible
      data-slot="mock-invoke-researcher-tool"
      data-status={props.status.type}
      open={open}
      onOpenChange={setOpen}
      className="my-2 w-full max-w-xl"
    >
      <CollapsibleTrigger
        data-slot="mock-nested-subagent-trigger"
        className="text-foreground/70 hover:text-foreground flex w-full items-center gap-2 py-1.5 text-sm transition-colors outline-none"
      >
        <ChevronRightIcon
          data-slot="mock-nested-subagent-chevron"
          className={[
            "size-3.5 shrink-0 transition-transform duration-200",
            "motion-reduce:transition-none",
            open ? "rotate-90" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        />
        <span className="font-medium">Architecture Researcher</span>
        <span
          data-slot="mock-nested-subagent-status"
          className="ms-auto flex size-4 shrink-0 items-center justify-center"
          aria-label={running ? "Working" : "Completed"}
        >
          {running ? (
            <Loader2Icon className="size-3.5 animate-spin motion-reduce:animate-none" />
          ) : (
            <CheckIcon className="size-3.5 text-emerald-500" />
          )}
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent
        data-slot="mock-nested-subagent-conversation"
        aria-label="Architecture Researcher conversation"
        className="border-border/60 ms-[7px] mt-1 border-s ps-5 pb-1 outline-none"
      >
        <MessagePartPrimitive.Messages>
          {() => <AssistantUiNestedMessage />}
        </MessagePartPrimitive.Messages>
      </CollapsibleContent>
    </Collapsible>
  );
};
