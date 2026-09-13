import type { ReactNode, ComponentType, FC, PropsWithChildren } from "react";
import {
  ActionBarPrimitive,
  AuiIf,
  BranchPickerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  groupPartByType,
  useAuiState,
} from "@assistant-ui/react";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, CopyIcon, RefreshCwIcon } from "lucide-react";

import { File } from "../../../vendor/assistant-ui/components/assistant-ui/elements/file";
import { Image } from "../../../vendor/assistant-ui/components/assistant-ui/elements/image";
import { MarkdownText } from "../../../vendor/assistant-ui/components/assistant-ui/elements/markdown-text";
import {
  Reasoning,
  ReasoningContent,
  ReasoningRoot,
  ReasoningText,
  ReasoningTrigger,
} from "../../../vendor/assistant-ui/components/assistant-ui/elements/reasoning.aui";
import { ToolFallback } from "../../../vendor/assistant-ui/components/assistant-ui/elements/tool-fallback.aui";
import {
  ToolGroupContent,
  ToolGroupRoot,
  ToolGroupTrigger,
} from "../../../vendor/assistant-ui/components/assistant-ui/elements/tool-group.aui";
import { TooltipIconButton } from "../../../vendor/assistant-ui/components/assistant-ui/elements/tooltip-icon-button";
import { cn } from "../../../vendor/assistant-ui/lib/utils";
import type {
  ThreadComponents,
  ThreadGroupPart,
} from "../../../vendor/assistant-ui/components/assistant-ui/elements/thread.aui";
import { SubagentList } from "../../../vendor/assistant-ui/components/assistant-ui/elements/subagent-list";
import {
  projectSubagentToolCalls,
  type SubagentToolCallPart,
} from "../agents/subagent-projection";
import { isSubagentDispatchTool, getAssistantUiToolPresentation } from "../toolkit/tool-presentation";

type AgentTraceGroupKey =
  | "group-agent-trace"
  | "group-agent-elements"
  | "group-agent-subagents"
  | "group-chainOfThought"
  | "group-reasoning"
  | "group-tool";

const defaultAssistantGroupBy = groupPartByType({
  reasoning: ["group-chainOfThought", "group-reasoning"],
  "tool-call": ["group-chainOfThought", "group-tool"],
  "standalone-tool-call": [],
});

const agentTraceGroupBy = (
  part: Parameters<typeof defaultAssistantGroupBy>[0],
  context: Parameters<typeof defaultAssistantGroupBy>[1],
): readonly AgentTraceGroupKey[] => {
  if (part.type === "tool-call") {
    const presentation = getAssistantUiToolPresentation(part.toolName);
    if (presentation?.kind === "agent-element") {
      return ["group-agent-trace", "group-agent-elements"];
    }
    if (presentation?.kind === "subagent-dispatch") {
      return ["group-agent-trace", "group-agent-subagents"];
    }
  }

  return defaultAssistantGroupBy(
    part,
    context,
  ) as readonly AgentTraceGroupKey[];
};

function AgentTraceSection({ children }: PropsWithChildren) {
  return (
    <div
      data-agent-ui-composition="agent-trace"
      className="mt-2 mb-6 flex flex-col items-start gap-4"
    >
      {children}
    </div>
  );
}

function AgentElementStack({ children }: PropsWithChildren) {
  return (
    <div
      data-agent-ui-composition="agent-elements"
      className="flex w-fit max-w-full flex-col items-start gap-3"
    >
      {children}
    </div>
  );
}

function AgentElementFrame({
  children,
  kind,
}: PropsWithChildren<{ kind: string }>) {
  return (
    <div
      data-agent-ui-composition-part={kind}
      className="w-fit max-w-full"
    >
      {children}
    </div>
  );
}

function isSubagentToolCallPart(part: unknown): part is SubagentToolCallPart {
  return typeof part === "object" && part !== null &&
    "type" in part && part.type === "tool-call" &&
    "toolName" in part && typeof part.toolName === "string" &&
    isSubagentDispatchTool(part.toolName);
}

function useSubagentToolCalls() {
  const parts = useAuiState((state) => state.message.parts);
  return parts.filter(isSubagentToolCallPart);
}

function AgentSubagentToolCall({
  fallback,
  part,
}: {
  fallback: ReactNode;
  part: SubagentToolCallPart;
}) {
  const parts = useSubagentToolCalls();
  const projection = projectSubagentToolCalls(parts);
  if (projection.eligibleToolCallIds.includes(part.toolCallId)) return null;
  return fallback;
}

function AgentSubagentAggregateGroup({
  children,
  group,
}: PropsWithChildren<{ group: Pick<ThreadGroupPart, "indices"> }>) {
  const allParts = useAuiState((state) => state.message.parts);
  const dispatchParts = allParts.filter(isSubagentToolCallPart);
  const projection = projectSubagentToolCalls(dispatchParts);
  const eligibleIds = new Set(projection.eligibleToolCallIds);
  const firstEligibleIndex = allParts.findIndex((part) =>
    isSubagentToolCallPart(part) && eligibleIds.has(part.toolCallId)
  );
  const showAggregate = firstEligibleIndex >= 0 &&
    group.indices.includes(firstEligibleIndex);

  return (
    <>
      {showAggregate && projection.view !== null ? (
        <AgentElementFrame kind="subagent-aggregate">
          <SubagentList
            agents={projection.view.agents}
            completedCount={projection.view.completedCount}
            progress={projection.view.progress}
            showSummary={projection.view.showSummary}
            summaryAgent={projection.view.summaryAgent}
          />
        </AgentElementFrame>
      ) : null}
      {children}
    </>
  );
}

type AgentTraceAssistantMessageOptions = Pick<
  ThreadComponents,
  "MessageFooter" | "ToolFallback" | "ToolGroup" | "ReasoningGroup"
>;

export function createAgentTraceAssistantMessage(
  options: AgentTraceAssistantMessageOptions,
): ComponentType {
  const AgentTraceAssistantMessage: FC = () => {
    const ToolFallbackComponent = options.ToolFallback ?? ToolFallback;
    const MessageFooter = options.MessageFooter;
    const ToolGroupComponent = options.ToolGroup;
    const ReasoningGroupComponent = options.ReasoningGroup;
    const actionBarHeight = "min-h-7.5 pt-1.5";

    return (
      <MessagePrimitive.Root
        data-slot="aui_assistant-message-root"
        data-role="assistant"
        className="fade-in slide-in-from-bottom-1 animate-in relative -mb-7.5 pb-7.5 duration-150 [contain-intrinsic-size:auto_200px] [content-visibility:auto]"
      >
        <div
          data-slot="aui_assistant-message-content"
          className="text-foreground px-2 leading-relaxed wrap-break-word"
        >
          <MessagePrimitive.GroupedParts
            groupBy={agentTraceGroupBy}
          >
            {({ part, children }) => {
              switch (part.type) {
                case "group-agent-trace":
                  return <AgentTraceSection>{children}</AgentTraceSection>;
                case "group-agent-elements":
                  return <AgentElementStack>{children}</AgentElementStack>;
                case "group-agent-subagents":
                  return (
                    <AgentSubagentAggregateGroup group={part}>
                      {children}
                    </AgentSubagentAggregateGroup>
                  );
                case "group-chainOfThought":
                  return <div data-slot="aui_chain-of-thought">{children}</div>;
                case "group-tool":
                  if (ToolGroupComponent) {
                    return (
                      <ToolGroupComponent group={part}>
                        {children}
                      </ToolGroupComponent>
                    );
                  }
                  return (
                    <ToolGroupRoot variant="ghost">
                      <ToolGroupTrigger
                        count={part.indices.length}
                        active={part.status.type === "running"}
                      />
                      <ToolGroupContent>{children}</ToolGroupContent>
                    </ToolGroupRoot>
                  );
                case "group-reasoning": {
                  if (ReasoningGroupComponent) {
                    return (
                      <ReasoningGroupComponent group={part}>
                        {children}
                      </ReasoningGroupComponent>
                    );
                  }
                  const running = part.status.type === "running";
                  return (
                    <ReasoningRoot streaming={running}>
                      <ReasoningTrigger active={running} />
                      <ReasoningContent aria-busy={running}>
                        <ReasoningText>{children}</ReasoningText>
                      </ReasoningContent>
                    </ReasoningRoot>
                  );
                }
                case "text":
                  return <MarkdownText />;
                case "reasoning":
                  return <Reasoning {...part} />;
                case "tool-call": {
                  const toolCall = part.toolUI ?? (
                    <ToolFallbackComponent {...part} />
                  );
                  const presentation = getAssistantUiToolPresentation(
                    part.toolName,
                  );
                  if (presentation?.kind === "agent-element") {
                    return (
                      <AgentElementFrame kind={presentation.element}>
                        {toolCall}
                      </AgentElementFrame>
                    );
                  }
                  if (presentation?.kind === "subagent-dispatch") {
                    return (
                      <AgentSubagentToolCall
                        fallback={
                          <AgentElementFrame kind="subagent-dispatch">
                            <ToolFallbackComponent {...part} />
                          </AgentElementFrame>
                        }
                        part={part}
                      />
                    );
                  }
                  return (
                    <div
                      className="my-1"
                      data-agent-ui-composition-part="tool-call"
                    >
                      {toolCall}
                    </div>
                  );
                }
                case "data":
                  return part.dataRendererUI;
                case "file":
                  return (
                    <div data-slot="aui_assistant-message-file" className="py-1">
                      <File {...part} />
                    </div>
                  );
                case "image":
                  return (
                    <div data-slot="aui_assistant-message-image" className="py-1">
                      <Image {...part} />
                    </div>
                  );
                case "indicator":
                  return (
                    <span
                      data-slot="aui_assistant-message-indicator"
                      className="animate-pulse font-sans"
                      aria-label="Assistant is working"
                    >
                      {"●"}
                    </span>
                  );
                default:
                  return null;
              }
            }}
          </MessagePrimitive.GroupedParts>
          <MessageError />
        </div>

        {MessageFooter ? <MessageFooter /> : null}

        <div
          data-slot="aui_assistant-message-footer"
          className={cn("ms-2 flex items-center", actionBarHeight)}
        >
          <BranchPicker />
          <AssistantActionBar />
        </div>
      </MessagePrimitive.Root>
    );
  };

  AgentTraceAssistantMessage.displayName = "AgentTraceAssistantMessage";
  return AgentTraceAssistantMessage;
}

const MessageError: FC = () => (
  <MessagePrimitive.Error>
    <ErrorPrimitive.Root className="border-destructive bg-destructive/10 text-destructive dark:bg-destructive/5 mt-2 rounded-md border p-3 text-sm dark:text-red-200">
      <ErrorPrimitive.Message className="line-clamp-2" />
    </ErrorPrimitive.Root>
  </MessagePrimitive.Error>
);

const AssistantActionBar: FC = () => (
  <ActionBarPrimitive.Root
    hideWhenRunning
    autohide="not-last"
    className="text-muted-foreground animate-in fade-in col-start-3 row-start-2 -ms-1 flex gap-1 duration-200"
  >
    <ActionBarPrimitive.Copy render={<TooltipIconButton tooltip="Copy" />}>
      <AuiIf condition={(state) => state.message.isCopied}>
        <CheckIcon />
      </AuiIf>
      <AuiIf condition={(state) => !state.message.isCopied}>
        <CopyIcon />
      </AuiIf>
    </ActionBarPrimitive.Copy>
    <ActionBarPrimitive.Reload render={<TooltipIconButton tooltip="Refresh" />}>
      <RefreshCwIcon />
    </ActionBarPrimitive.Reload>
  </ActionBarPrimitive.Root>
);

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({
  className,
  ...rest
}) => (
  <BranchPickerPrimitive.Root
    hideWhenSingleBranch
    className={cn(
      "text-muted-foreground -ms-2 me-2 inline-flex items-center text-xs",
      className,
    )}
    {...rest}
  >
    <BranchPickerPrimitive.Previous render={<TooltipIconButton tooltip="Previous" />}>
      <ChevronLeftIcon />
    </BranchPickerPrimitive.Previous>
    <span className="font-medium">
      <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
    </span>
    <BranchPickerPrimitive.Next render={<TooltipIconButton tooltip="Next" />}>
      <ChevronRightIcon />
    </BranchPickerPrimitive.Next>
  </BranchPickerPrimitive.Root>
);
