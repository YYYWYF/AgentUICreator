import {
  AgentApplication,
  type AgentProps as RuntimeAgentProps,
} from "@za38.03/agent-ui-runtime/ui";
import { isAgentUITheme, type AgentUITheme } from "@za38.03/agent-ui-plugins";
import type { ConversationDataSource } from "../services/conversations";
import type { ConversationRunResumeProvider } from "@za38.03/agent-ui-plugins/conversation-service";
import type { AppAgentState } from "@za38.03/agent-ui-runtime/ui/agent-contract/agent-state";
import { AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE } from "../services/conversations";
import { usePreviewAgentEnvironment } from "@za38.03/agent-ui-runtime/ui/application/preview-environment";
import { agentUIProject } from "./project-config";
export interface AgentProps
  extends Omit<RuntimeAgentProps, "theme" | "onThemeChange" | "runResumeProvider"> {
  conversationDataSource?: ConversationDataSource | undefined;
  theme?: AgentUITheme | undefined;
  onThemeChange?: ((theme: AgentUITheme) => void) | undefined;
  runResumeProvider?: ConversationRunResumeProvider<AppAgentState> | undefined;
}
export function Agent({
  conversationDataSource,
  onThemeChange,
  ...props
}: AgentProps = {}) {
  const preview = usePreviewAgentEnvironment(agentUIProject.development);
  const dataSource = preview?.conversationDataEndpointOverride
    ? undefined
    : conversationDataSource;
  return (
    <AgentApplication
      project={agentUIProject}
      {...props}
      onThemeChange={(theme) => {
        if (isAgentUITheme(theme)) onThemeChange?.(theme);
      }}
      services={{
        ...props.services,
        ...(dataSource === undefined
          ? {}
          : { [AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE]: dataSource }),
      }}
    />
  );
}
