"use client";

import { ChevronRightIcon, type LucideIcon } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../../../../vendor/assistant-ui/components/ui/collapsible.js";
import { cn } from "../../../../../vendor/assistant-ui/lib/utils.js";
import { collapsePanel, ShimmerLabel, SwapLabel } from "../../../../../vendor/assistant-ui/components/assistant-ui/elements/surfaces.js";
import { take } from "../../../../../vendor/assistant-ui/components/assistant-ui/utils/range.js";

export interface TimelineStep {
  verb: string;
  chip: string;
  icon: LucideIcon;
}

export interface TimelineStat {
  file: string;
  added?: number;
  removed?: number;
}

export interface ToolTimelineProps {
  steps: readonly TimelineStep[];
  visibleSteps: number;
  streaming: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restingLabel: string;
  activeLabel: string;
  stats: TimelineStat[];
  className?: string;
}

export function ToolTimeline({
  steps,
  visibleSteps,
  streaming,
  open,
  onOpenChange,
  restingLabel,
  activeLabel,
  stats,
  className,
}: ToolTimelineProps) {
  return (
    <Collapsible data-agent-ui-owned=""
      data-slot="tool-timeline"
      open={open}
      onOpenChange={onOpenChange}
      className={cn("w-full max-w-sm", className)}
    >
      <CollapsibleTrigger data-agent-ui-owned="" className="group/trigger text-foreground/55 hover:text-foreground/90 flex items-center gap-1.5 rounded-md py-1 text-[13.5px] transition-colors outline-none">
        <ChevronRightIcon className="size-3.5 shrink-0 opacity-60 transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] group-data-open/trigger:rotate-90 group-data-panel-open/trigger:rotate-90 motion-reduce:transition-none" />
        <SwapLabel
          active={streaming ? 0 : 1}
          className="text-start tabular-nums"
        >
          <ShimmerLabel data-agent-ui-owned=""
            active={streaming}
            className="relative inline-block leading-none"
          >
            {activeLabel}
          </ShimmerLabel>
          <>{restingLabel}</>
        </SwapLabel>
      </CollapsibleTrigger>
      <CollapsibleContent data-agent-ui-owned="" className={cn(collapsePanel, "outline-none")}>
        <div data-agent-ui-owned="" className="flex flex-col gap-2.5 ps-4 pt-2.5">
          {take(steps, visibleSteps).map((step, index, shown) => {
            const Icon = step.icon;
            const active = streaming && index === shown.length - 1;

            return (
              <div data-agent-ui-owned=""
                key={step.chip}
                className="fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-foreground/55 flex items-center gap-2 text-[13.5px] duration-300"
              >
                <Icon className="text-foreground/35 size-3.5 shrink-0" />
                <ShimmerLabel data-agent-ui-owned=""
                  active={active}
                  className="relative inline-block leading-none"
                >
                  {step.verb}
                </ShimmerLabel>
                <span data-agent-ui-owned="" className="bg-foreground/[0.06] text-foreground/70 rounded-md px-1.5 py-0.5 font-mono text-[11px]">
                  {step.chip}
                </span>
              </div>
            );
          })}
          {stats.length > 0 && (
            <div data-agent-ui-owned="" className="flex flex-wrap gap-1.5 pt-1">
              {stats.map((stat) => (
                <span data-agent-ui-owned=""
                  key={stat.file}
                  className="bg-foreground/[0.06] text-foreground/70 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px]"
                >
                  <span data-agent-ui-owned="">{stat.file}</span>
                  {stat.added !== undefined && (
                    <span data-agent-ui-owned="" className="text-emerald-600 dark:text-emerald-400">
                      +{stat.added}
                    </span>
                  )}
                  {stat.removed !== undefined && (
                    <span data-agent-ui-owned="" className="text-red-600 dark:text-red-400">
                      −{stat.removed}
                    </span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
