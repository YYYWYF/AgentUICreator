import type {
  ConversationToolCallComponent,
  ConversationToolCallProps,
} from "@agent-ui/react";
import { useState } from "react";
import { CheckIcon, ChevronRightIcon, Loader2Icon } from "lucide-react";

import {
  ConversationSubagentMessages,
  ConversationToolFallback,
} from "@agent-ui/react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@agent-ui/react";

type MockInvokeResearcherArgs = Record<string, unknown>;

function shouldUseFallback(
  props: ConversationToolCallProps,
): boolean {
  return props.isError === true ||
    props.status.type === "requires-action" ||
    props.status.type === "incomplete";
}

export function ConversationNestedMessage() {
  return <ConversationSubagentMessages />;
}

export const MockInvokeResearcherToolUI: ConversationToolCallComponent = (props) => {
  const [open, setOpen] = useState(true);
  if (shouldUseFallback(props)) return <ConversationToolFallback {...props} />;
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
        className="ms-5 mt-1 min-w-0 pb-1 outline-none"
      >
        <ConversationNestedMessage />
      </CollapsibleContent>
    </Collapsible>
  );
};
