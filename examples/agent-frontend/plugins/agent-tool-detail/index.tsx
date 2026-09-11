import { useState } from "react";

import { AgentToolDetail } from "../../agent-ui/components/tool-detail";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import {
  useAgentExecutions,
  useAgentMessages,
  useAgentRun,
  usePluginInstance,
} from "../../runtime/context";
import { usePluginService, usePluginServiceSnapshot } from "../../runtime/plugins";
import {
  AGENT_UI_CONVERSATION_SERVICE,
  EMPTY_CONVERSATION_SNAPSHOT,
  getConversationViewMessages,
  type AgentUIConversationService,
} from "../../services/conversations";
import { inspectToolCalls } from "../_shared/agent-ui-data";
import {
  ToolCallIdentity,
  ToolDetailArguments,
  ToolDetailResult,
  toolDetailStatusLabels,
  toolDetailStatusMap,
} from "./tool-detail-presentation";

import "./styles.css";

export function AgentToolDetailPlugin(_props: UIPluginComponentProps) {
  const allMessages = useAgentMessages();
  const executions = useAgentExecutions();
  const run = useAgentRun();
  const instance = usePluginInstance();
  const conversation = usePluginService<AgentUIConversationService>(
    AGENT_UI_CONVERSATION_SERVICE,
  );
  const snapshot = usePluginServiceSnapshot(
    conversation,
    EMPTY_CONVERSATION_SNAPSHOT,
  );
  const messages = getConversationViewMessages(allMessages, snapshot);
  const calls = inspectToolCalls(messages, executions);
  const requestedToolCallId =
    typeof instance.props?.toolCallId === "string"
      ? instance.props.toolCallId
      : undefined;
  const [selectedToolCallId, setSelectedToolCallId] = useState<
    string | undefined
  >(requestedToolCallId ?? calls.at(-1)?.id);
  const selectedCall =
    calls.find((call) => call.id === selectedToolCallId) ??
    calls.find((call) => call.id === requestedToolCallId) ??
    calls.at(-1);

  return (
    <div
      className="agent-tool-detail-plugin"
      data-agent-run-status={run.status}
      data-ui-plugin="agent-tool-detail"
    >
      {selectedCall === undefined ? (
        <AgentToolDetail
          ariaLabel="工具调用详情"
          className="agent-tool-detail-plugin-surface"
          emptyState={(
            <div className="agent-tool-detail-plugin-empty">
              当前会话暂无工具调用
            </div>
          )}
          meta={`${calls.length} 个调用`}
          state="empty"
          title="工具详情"
        />
      ) : (
        <AgentToolDetail
          ariaLabel="工具调用详情"
          argumentsContent={<ToolDetailArguments call={selectedCall} />}
          className="agent-tool-detail-plugin-surface"
          meta={`${calls.length} 个调用`}
          name={selectedCall.name}
          resultContent={<ToolDetailResult call={selectedCall} />}
          selector={(
            <select
              aria-label="选择工具调用"
              className="agent-tool-detail-plugin-selector"
              onChange={(event) =>
                setSelectedToolCallId(event.currentTarget.value)
              }
              value={selectedCall.id}
            >
              {calls.map((call) => (
                <option key={call.id} value={call.id}>
                  {call.name}
                </option>
              ))}
            </select>
          )}
          state="selected"
          status={toolDetailStatusMap[selectedCall.status]}
          statusLabel={toolDetailStatusLabels[selectedCall.status]}
          title="工具详情"
          toolCallId={<ToolCallIdentity toolCallId={selectedCall.id} />}
        />
      )}
    </div>
  );
}
