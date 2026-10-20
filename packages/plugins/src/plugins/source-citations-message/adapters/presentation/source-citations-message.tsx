import { Fragment, type ComponentProps, type ComponentType, type ReactNode } from "react";
import { cn } from "../../../../plugin-support.js";
import { ConversationSource, ConversationToolFallback, type ConversationSourcePart, type ConversationToolCallProps } from "../../../../public.js";
import { projectSourceCitationsResult } from "./projection.js";
export interface SourceCitationsMessageProps extends ConversationToolCallProps {
  rootProps?: Omit<ComponentProps<"div">, "children">;
  /** Full, discriminated source props preserve URL/document type safety. */
  sourceProps?: (source: ConversationSourcePart, index: number) => ConversationSourcePart;
  renderSource?: (source: ConversationSourcePart, index: number, tool: ConversationToolCallProps) => ReactNode;
  renderSources?: (sources: readonly ConversationSourcePart[], tool: ConversationToolCallProps) => ReactNode;
  Fallback?: ComponentType<ConversationToolCallProps>;
}
export function CanonicalSourceCitationsMessage({ rootProps, sourceProps, renderSource, renderSources, Fallback = ConversationToolFallback, ...tool }: SourceCitationsMessageProps) {
  const sources = projectSourceCitationsResult(tool.result);
  if (tool.status.type !== "complete" || tool.isError === true || sources === null) return <Fallback {...tool} />;
  const configured = sources.map((source, index) => sourceProps ? sourceProps(source, index) : source);
  const children = renderSources ? renderSources(configured, tool) : configured.map((source, index) => <Fragment key={sources[index]!.id}>{renderSource ? renderSource(source, index, tool) : <ConversationSource {...source} />}</Fragment>);
  return <div
    {...rootProps}
    data-agent-ui-owned=""
    className={cn("mt-2 flex flex-wrap items-center gap-1.5", rootProps?.className)}
  >{children}</div>;
}
