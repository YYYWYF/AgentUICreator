import { useCallback, useState } from "react";

import type { AgentRunState } from "../../framework/contracts/ui-plugin";
import {
  useAgentExecutions,
  useAgentInterrupts,
  useAgentRun,
  usePluginActions,
  usePluginInstance,
} from "../../runtime/context";
import {
  usePluginService,
  usePluginServiceSnapshot,
} from "../../runtime/plugins";
import {
  AGENT_UI_CONVERSATION_SERVICE,
  EMPTY_CONVERSATION_SNAPSHOT,
  type AgentUIConversationService,
} from "../../services/conversations";

export interface AgentComposerBinding {
  value: string;
  onValueChange: (value: string) => void;
  running: boolean;
  disabled: boolean;
  placeholder: string;
  onSubmit: (value: string) => void;
  onStop: () => void;
  historyMode: boolean;
  runStatus: AgentRunState["status"];
  error: AgentRunState["error"];
}

export function useAgentComposerBinding(): AgentComposerBinding {
  const [value, setValue] = useState("");
  const executions = useAgentExecutions();
  const interrupts = useAgentInterrupts();
  const run = useAgentRun();
  const instance = usePluginInstance();
  const actions = usePluginActions();
  const conversation = usePluginService<AgentUIConversationService>(
    AGENT_UI_CONVERSATION_SERVICE,
  );
  const conversationSnapshot = usePluginServiceSnapshot(
    conversation,
    EMPTY_CONVERSATION_SNAPSHOT,
  );
  const historyMode = conversationSnapshot.mode === "history";
  const hasPendingTool = executions.some(
    (execution) =>
      execution.type === "tool" &&
      execution.status === "awaiting-result",
  );
  const running =
    run.status === "running" ||
    interrupts.length > 0 ||
    hasPendingTool;
  const placeholder = historyMode
    ? "历史会话为只读，请返回当前会话或新建会话"
    : typeof instance.props?.placeholder === "string"
      ? instance.props.placeholder
      : "给智能体发送消息";

  const onSubmit = useCallback((rawValue: string) => {
    const message = rawValue.trim();
    if (message.length === 0 || running || historyMode) return;

    void (async () => {
      try {
        await actions.sendMessage(message);
        setValue("");
      } catch {
        // The Runtime projects the error back through useAgentRun().
      }
    })();
  }, [actions, historyMode, running]);

  const onStop = useCallback(() => {
    actions.abortRun();
  }, [actions]);

  return {
    value,
    onValueChange: setValue,
    running,
    disabled: historyMode,
    placeholder,
    onSubmit,
    onStop,
    historyMode,
    runStatus: run.status,
    error: run.error,
  };
}
