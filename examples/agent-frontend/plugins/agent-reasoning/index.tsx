import type { AgentReasoningStatus } from "../../agent-ui/components/reasoning";
import { AgentReasoning } from "../../agent-ui/components/reasoning";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { usePluginInstance } from "../../runtime/context";
import { useReasoningRenderContext } from "../../runtime/message-rendering";
import {
  resolveReasoningCollapseDelayMs,
  useReasoningDisclosure,
} from "./reasoning-disclosure";

export function AgentReasoningPlugin(_props: UIPluginComponentProps) {
  const { execution, message, running, turnId } = useReasoningRenderContext();
  const instance = usePluginInstance();
  const defaultExpanded = instance.props?.defaultExpanded !== false;
  const collapseOnComplete = instance.props?.collapseOnComplete !== false;
  const collapseDelayMs = resolveReasoningCollapseDelayMs(
    instance.props?.collapseDelayMs,
  );
  const status: AgentReasoningStatus =
    execution?.status ?? (running ? "running" : "completed");
  const disclosure = useReasoningDisclosure({
    messageId: message.id,
    running,
    status,
    defaultExpanded,
    collapseOnComplete,
    collapseDelayMs,
  });
  const label =
    status === "running"
      ? "正在思考"
      : status === "interrupted"
        ? "思考已停止"
        : "思考过程";

  return (
    <div
      data-agent-message-id={message.id}
      data-reasoning-status={status}
      data-agent-turn-id={turnId}
      data-ui-plugin="agent-reasoning"
    >
      <AgentReasoning
        status={status}
        expanded={disclosure.expanded}
        onExpandedChange={disclosure.onExpandedChange}
        label={label}
        ariaLabel={label}
      >
        {message.content}
      </AgentReasoning>
    </div>
  );
}
