"use client";

import { useAgentUILocale } from "../../../../../../locale.js";

import { CheckIcon, ChevronRightIcon } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../../../../vendor/assistant-ui/components/ui/collapsible.js";
import { cn } from "../../../../../vendor/assistant-ui/lib/utils.js";
import {
  collapsePanel,
  field,
  mono,
  ShimmerLabel,
  SwapLabel,
} from "../../../../../vendor/assistant-ui/components/assistant-ui/elements/surfaces.js";

export interface ToolCallProps {
  label: string;
  activeLabel: string;
  query: string;
  request: string;
  result: string;
  running: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
}

export function ToolCall({
  label,
  activeLabel,
  query,
  request,
  result,
  running,
  open,
  onOpenChange,
  className,
}: ToolCallProps) {
  const messages = useAgentUILocale("toolPresentation");
  return (
    <Collapsible data-agent-ui-owned=""
      data-slot="tool-call"
      open={open}
      onOpenChange={onOpenChange}
      className={cn("w-full max-w-sm", className)}
    >
      <CollapsibleTrigger data-agent-ui-owned="" className="focus-visible:ring-1 focus-visible:ring-ring/50 group/trigger text-foreground/55 hover:text-foreground/90 flex items-center gap-2 rounded-md py-1 text-[13.5px] transition-colors outline-none">
        <ChevronRightIcon className="size-3.5 shrink-0 opacity-60 transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] group-data-open/trigger:rotate-90 group-data-panel-open/trigger:rotate-90 motion-reduce:transition-none" />
        <SwapLabel active={running ? 0 : 1} className="text-start">
          <ShimmerLabel data-agent-ui-owned=""
            active={running}
            className="relative inline-block leading-none"
          >
            {activeLabel}
          </ShimmerLabel>
          <>{label}</>
        </SwapLabel>
        <span data-agent-ui-owned=""
          className={cn(
            mono,
            "bg-foreground/[0.06] text-foreground/70 rounded-md px-1.5 py-0.5",
          )}
        >
          {query}
        </span>
        <span data-agent-ui-owned="" className="ms-auto flex w-4 items-center justify-end">
          {!running && (
            <CheckIcon className="fade-in zoom-in-90 animate-in size-3.5 text-emerald-500 duration-200" />
          )}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent data-agent-ui-owned="" className={cn(collapsePanel, "outline-none")}>
        <div data-agent-ui-owned="" className={cn(field, "mt-2 overflow-hidden rounded-2xl text-xs")}>
          <div data-agent-ui-owned="" className="px-3.5 pt-2.5 pb-2">
            <p data-agent-ui-owned="" className={cn(mono, "text-foreground/35 mb-1")}>{messages.request}</p>
            <p data-agent-ui-owned="" className="text-foreground/55 font-mono">{request}</p>
          </div>
          <div data-agent-ui-owned="" className="bg-foreground/[0.06] mx-3.5 h-px" />
          <div data-agent-ui-owned="" className="px-3.5 pt-2 pb-2.5">
            <p data-agent-ui-owned="" className={cn(mono, "text-foreground/35 mb-1")}>{messages.result}</p>
            <p data-agent-ui-owned="" className="text-foreground/90">{result}</p>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
