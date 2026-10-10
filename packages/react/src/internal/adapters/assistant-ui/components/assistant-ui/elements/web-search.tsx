"use client";

import { useAgentUILocale, DEFAULT_AGENT_UI_MESSAGES } from "../../../../../../locale.js";

import type { ComponentProps } from "react";
import { SearchIcon } from "lucide-react";
import { cn } from "../../../../../vendor/assistant-ui/lib/utils.js";
import { field, mono, ShimmerLabel } from "../../../../../vendor/assistant-ui/components/assistant-ui/elements/surfaces.js";
import { take } from "../../../../../vendor/assistant-ui/components/assistant-ui/utils/range.js";

export interface WebSearchResult {
  title: string;
  domain: string;
}

export function WebSearch({
  query,
  results,
  visibleResults,
  searching,
  labels,
  cycle,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "query" | "results" | "visibleResults" | "searching" | "cycle"
> & {
  query: string;
  results: readonly WebSearchResult[];
  visibleResults: number;
  searching: boolean;
  cycle: number;
  labels?: { searching: string; complete: string };
}) {
  const localeMessages = useAgentUILocale();
  return (
    <div data-agent-ui-owned=""
      data-slot="web-search"
      className={cn("flex w-full max-w-sm flex-col gap-2.5", className)}

      {...props}
    >
      <span data-agent-ui-owned=""
        className={cn(
          field,
          "text-foreground/70 inline-flex w-fit items-center gap-1.5 rounded-full px-3.5 py-2 text-xs",
        )}
      >
        <SearchIcon className="text-foreground/40 size-3" />
        {query}
      </span>
      <div data-agent-ui-owned="" className="text-foreground/45 text-xs">
        {searching ? (
          <ShimmerLabel data-agent-ui-owned="" className="relative inline-block leading-none">
            {labels?.searching ?? localeMessages.search.searching}
          </ShimmerLabel>
        ) : (
          <span data-agent-ui-owned="" className="fade-in animate-in duration-300">
            {labels?.complete.replace("{count}", String(results.length)) ?? localeMessages.search.readSources}
          </span>
        )}
      </div>
      <div data-agent-ui-owned="" className="flex min-h-[5.75rem] flex-col">
        {take(results, visibleResults).map((result) => (
          <div data-agent-ui-owned=""
            key={`${cycle}-${result.domain}`}
            className="fade-in slide-in-from-bottom-1 animate-in fill-mode-both hover:bg-foreground/[0.03] -mx-2.5 flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 transition-colors duration-300"
          >
            <span data-agent-ui-owned="" className="bg-foreground/[0.06] text-foreground/45 flex size-4 shrink-0 items-center justify-center rounded text-[9px] font-medium">
              {result.domain.charAt(0).toUpperCase()}
            </span>
            <span data-agent-ui-owned="" className="text-foreground/90 min-w-0 flex-1 truncate text-[13.5px]">
              {result.title}
            </span>
            <span data-agent-ui-owned="" className={cn(mono, "text-foreground/35 shrink-0")}>
              {result.domain}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
