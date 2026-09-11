import { AgentTool } from "../../agent-ui/components/tool";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { usePluginInstance } from "../../runtime/context";
import { useToolRenderContext } from "../../runtime/message-rendering";

import { useToolDisclosure } from "./tool-disclosure";
import {
  createToolSummary,
  resolveAgentToolStatus,
  ToolDetails,
  toolStatusLabels,
} from "./tool-presentation";

import "./styles.css";

export function AgentToolPlugin(_props: UIPluginComponentProps) {
  const { execution, result, running, toolCall, turnId } =
    useToolRenderContext();
  const instance = usePluginInstance();
  const defaultExpanded = instance.props?.defaultExpanded === true;
  const showArguments = instance.props?.showArguments !== false;
  const showResult = instance.props?.showResult !== false;
  const status = resolveAgentToolStatus(result, execution, running);
  const disclosure = useToolDisclosure({
    toolCallId: toolCall.id,
    defaultExpanded,
  });
  const summary = createToolSummary(status, result);

  return (
    <div
      data-agent-turn-id={turnId}
      data-tool-call-id={toolCall.id}
      data-tool-status={status}
      data-ui-plugin="agent-tool"
    >
      <AgentTool
        status={status}
        expanded={disclosure.expanded}
        onExpandedChange={disclosure.onExpandedChange}
        name={toolCall.function.name}
        summary={summary}
        statusLabel={toolStatusLabels[status]}
        ariaLabel={`工具 ${toolCall.function.name}`}
      >
        <ToolDetails
          argumentsText={toolCall.function.arguments}
          result={result}
          execution={execution}
          status={status}
          showArguments={showArguments}
          showResult={showResult}
        />
      </AgentTool>
    </div>
  );
}
