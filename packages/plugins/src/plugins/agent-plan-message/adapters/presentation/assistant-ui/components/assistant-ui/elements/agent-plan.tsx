"use client";

import type { ComponentProps } from "react";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { cn } from "../../../../../vendor-generated/assistant-ui/lib/utils.js";
import { mono } from "../../../../../vendor-generated/assistant-ui/components/assistant-ui/elements/surfaces.js";
import { announced, pct, progressOf } from "../../../../../vendor-generated/assistant-ui/components/assistant-ui/utils/range.js";

export type AgentPlanStep = {
  id?: string | undefined;
  label: string;
  description?: string | undefined;
};

export function AgentPlan({
  steps,
  activeIndex,
  title = "Plan",
  className,
  ...props
}: Omit<ComponentProps<"div">, "children" | "steps" | "activeIndex"> & {
  steps: readonly (string | AgentPlanStep)[];
  activeIndex: number;
  title?: string | undefined;
}) {
  const total = steps.length;
  const completed = progressOf(activeIndex, total);
  const allDone = completed >= total;
  const progress = pct(completed, total);

  return (
    <div data-agent-ui-owned=""
      data-slot="agent-plan"
      className={cn("flex w-full max-w-sm flex-col gap-3", className)}

      {...props}
    >
      <div data-agent-ui-owned="" className="flex items-center justify-between">
        <span data-agent-ui-owned="" className="text-[13.5px] font-medium">{title}</span>
        <span data-agent-ui-owned="" className={cn(mono, "text-muted-foreground tabular-nums")}>
          {completed} of {total}
        </span>
      </div>
      <div data-agent-ui-owned=""
        role="progressbar"
        aria-label={`${title} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={announced(progress)}
        aria-valuetext={`${completed} of ${total} steps`}
        className="bg-foreground/[0.06] inset-ring-border h-[3px] w-full overflow-hidden rounded-full inset-ring forced-colors:outline"
      >
        <span data-agent-ui-owned=""
          aria-hidden
          className="bg-foreground/80 block h-full rounded-full transition-[width] duration-500 forced-color-adjust-none motion-reduce:transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>
      <ul data-agent-ui-owned="" className="flex flex-col gap-2.5">
        {steps.map((step, i) => {
          const item = typeof step === "string" ? { label: step } : step;
          const done = allDone || i < completed;
          const active = !allDone && i === completed;
          const status = done ? "done" : active ? "in progress" : "not started";
          return (
            <li data-agent-ui-owned=""
              key={typeof step === "string" ? i : (step.id ?? i)}
              className={cn(
                "flex gap-2.5 text-[13.5px]",
                active && item.description ? "items-start" : "items-center",
              )}
            >
              <span data-agent-ui-owned="" className="flex size-4 shrink-0 items-center justify-center">
                {done ? (
                  <CheckIcon
                    aria-hidden
                    className="text-muted-foreground size-3.5"
                  />
                ) : active ? (
                  <Loader2Icon
                    aria-hidden
                    className="text-foreground/90 size-3.5 animate-spin motion-reduce:animate-none"
                  />
                ) : (
                  <span data-agent-ui-owned=""
                    aria-hidden
                    className="bg-foreground/15 inset-ring-border size-1.5 rounded-full inset-ring forced-colors:border"
                  />
                )}
              </span>
              <span data-agent-ui-owned="" className="min-w-0">
                <span data-agent-ui-owned=""
                  className={cn(
                    done && "text-muted-foreground",
                    active && "text-foreground/90",
                    !done && !active && "text-muted-foreground",
                  )}
                >
                  {item.label}
                </span>
                <span data-agent-ui-owned="" className="sr-only">{` ${status}`}</span>
                {active && item.description ? (
                  <span data-agent-ui-owned="" className="text-muted-foreground mt-0.5 block text-xs">
                    {item.description}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
