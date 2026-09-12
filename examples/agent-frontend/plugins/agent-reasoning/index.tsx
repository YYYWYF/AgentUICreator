import { useRef } from "react";

import type { AgentReasoningStatus } from "../../agent-ui/components/reasoning";
import {
  AGENT_REASONING_ANIMATION_DURATION_MS,
  AgentReasoning,
} from "../../agent-ui/components/reasoning";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { usePluginInstance } from "../../runtime/context";
import { useReasoningRenderContext } from "../../runtime/message-rendering";
import { useReasoningDisclosure } from "./reasoning-disclosure";
import { useReasoningLivePreview } from "./reasoning-live-preview";
import { useReasoningScrollLock } from "./reasoning-scroll-lock";

export function AgentReasoningPlugin(_props: UIPluginComponentProps) {
  const { message, running, status, turnId } = useReasoningRenderContext();
  const instance = usePluginInstance();
  const defaultExpanded = instance.props?.defaultExpanded !== false;
  const reasoningStatus: AgentReasoningStatus = status;
  const streaming = running && reasoningStatus === "running";
  const rootRef = useRef<HTMLElement>(null);
  const textViewportRef = useRef<HTMLDivElement>(null);
  const textContentRef = useRef<HTMLDivElement>(null);
  const lockScroll = useReasoningScrollLock(
    rootRef,
    AGENT_REASONING_ANIMATION_DURATION_MS,
  );
  const disclosure = useReasoningDisclosure({
    messageId: message.id,
    streaming,
    status: reasoningStatus,
    defaultExpanded,
    onAutomaticAnimationStart: lockScroll,
  });
  useReasoningLivePreview({
    textViewportRef,
    textContentRef,
    streaming,
    expanded: disclosure.expanded,
    resetKey: message.id,
  });
  const label =
    reasoningStatus === "running"
      ? "正在思考"
      : reasoningStatus === "error"
        ? "思考失败"
        : reasoningStatus === "interrupted"
          ? "思考已停止"
          : "思考过程";

  return (
    <div
      data-agent-message-id={message.id}
      data-reasoning-status={reasoningStatus}
      data-agent-turn-id={turnId}
      data-ui-plugin="agent-reasoning"
    >
      <AgentReasoning
        status={reasoningStatus}
        expanded={disclosure.expanded}
        streaming={streaming}
        onExpandedChange={disclosure.onExpandedChange}
        onAnimationStart={lockScroll}
        label={label}
        ariaLabel={label}
        rootRef={rootRef}
        textViewportRef={textViewportRef}
        textContentRef={textContentRef}
      >
        {message.content}
      </AgentReasoning>
    </div>
  );
}
