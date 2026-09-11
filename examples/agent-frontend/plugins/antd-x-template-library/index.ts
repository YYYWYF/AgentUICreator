import { antdXActivityFeedPlugin } from "../antd-x-activity-feed/definition";
import { antdXAttachmentsPlugin } from "../antd-x-attachments/definition";
import { agentConversationsPlugin } from "../agent-conversations/definition";
import { agentMessageListPlugin } from "../agent-message-list/definition";
import { agentReasoningPlugin } from "../agent-reasoning/definition";
import { agentSuggestionsPlugin } from "../agent-suggestions/definition";
import { agentThreadWelcomePlugin } from "../agent-thread-welcome/definition";
import { agentToolPlugin } from "../agent-tool/definition";
import { agentToolActivityPlugin } from "../agent-tool-activity/definition";
import { antdXResourcesPlugin } from "../antd-x-resources/definition";
import { antdXRunTimelinePlugin } from "../antd-x-run-timeline/definition";
import { agentComposerPlugin } from "../agent-composer/definition";
import { antdXSourcesPlugin } from "../antd-x-sources/definition";
import { antdXThemeProviderPlugin } from "../antd-x-theme-provider/definition";
import { antdXThemeSwitchPlugin } from "../antd-x-theme-switch/definition";
import { agentToolDetailPlugin } from "../agent-tool-detail/definition";
import { conversationSurfacePlugin } from "../conversation-surface/definition";
import { conversationDataSourcePlugin } from "../conversation-data-source/definition";
import { conversationControllerPlugin } from "../conversation-controller/definition";
import { workspaceInspectorPlugin } from "../workspace-inspector/definition";

export const antdXTemplatePlugins = [
  conversationDataSourcePlugin,
  conversationControllerPlugin,
  antdXThemeProviderPlugin,
  antdXThemeSwitchPlugin,
  agentConversationsPlugin,
  agentThreadWelcomePlugin,
  agentMessageListPlugin,
  agentToolActivityPlugin,
  agentToolPlugin,
  antdXRunTimelinePlugin,
  agentToolDetailPlugin,
  agentReasoningPlugin,
  antdXActivityFeedPlugin,
  antdXSourcesPlugin,
  antdXAttachmentsPlugin,
  antdXResourcesPlugin,
  agentSuggestionsPlugin,
  agentComposerPlugin,
  conversationSurfacePlugin,
  workspaceInspectorPlugin,
] as const;

export {
  antdXActivityFeedPlugin,
  antdXAttachmentsPlugin,
  agentConversationsPlugin,
  agentMessageListPlugin,
  agentReasoningPlugin,
  agentSuggestionsPlugin,
  agentThreadWelcomePlugin,
  antdXResourcesPlugin,
  antdXRunTimelinePlugin,
  agentComposerPlugin,
  antdXSourcesPlugin,
  antdXThemeProviderPlugin,
  antdXThemeSwitchPlugin,
  agentToolDetailPlugin,
  agentToolActivityPlugin,
  agentToolPlugin,
  conversationDataSourcePlugin,
  conversationControllerPlugin,
  conversationSurfacePlugin,
  workspaceInspectorPlugin,
};

export { AntdXActivityFeedPlugin } from "../antd-x-activity-feed";
export { AntdXAttachmentsPlugin } from "../antd-x-attachments";
export { AgentConversationsPlugin } from "../agent-conversations";
export { AgentMessageListPlugin } from "../agent-message-list";
export { AgentReasoningPlugin } from "../agent-reasoning";
export { AgentSuggestionsPlugin } from "../agent-suggestions";
export { AgentThreadWelcomePlugin } from "../agent-thread-welcome";
export { AntdXResourcesPlugin } from "../antd-x-resources";
export { AntdXRunTimelinePlugin } from "../antd-x-run-timeline";
export { AgentComposerPlugin } from "../agent-composer";
export { AntdXSourcesPlugin } from "../antd-x-sources";
export { AntdXThemeProviderPlugin } from "../antd-x-theme-provider";
export { AntdXThemeSwitchPlugin } from "../antd-x-theme-switch";
export { AgentToolDetailPlugin } from "../agent-tool-detail";
export { AgentToolActivityPlugin } from "../agent-tool-activity";
export { AgentToolPlugin } from "../agent-tool";
export { ConversationSurfacePlugin } from "../conversation-surface";
export { ConversationDataSourcePlugin } from "../conversation-data-source";
export { ConversationControllerPlugin } from "../conversation-controller";
export { WorkspaceInspectorPlugin } from "../workspace-inspector";
export * from "../../services/agent-ui-theme";
