import { antdXActivityFeedPlugin } from "../antd-x-activity-feed/definition";
import { antdXAttachmentsPlugin } from "../antd-x-attachments/definition";
import { antdXConversationsPlugin } from "../antd-x-conversations/definition";
import { agentMessageListPlugin } from "../agent-message-list/definition";
import { agentReasoningPlugin } from "../agent-reasoning/definition";
import { agentToolPlugin } from "../agent-tool/definition";
import { agentToolActivityPlugin } from "../agent-tool-activity/definition";
import { antdXPromptsPlugin } from "../antd-x-prompts/definition";
import { antdXResourcesPlugin } from "../antd-x-resources/definition";
import { antdXRunTimelinePlugin } from "../antd-x-run-timeline/definition";
import { agentComposerPlugin } from "../agent-composer/definition";
import { antdXSourcesPlugin } from "../antd-x-sources/definition";
import { antdXThemeProviderPlugin } from "../antd-x-theme-provider/definition";
import { antdXThemeSwitchPlugin } from "../antd-x-theme-switch/definition";
import { antdXToolDetailPlugin } from "../antd-x-tool-detail/definition";
import { antdXWelcomePlugin } from "../antd-x-welcome/definition";
import { conversationSurfacePlugin } from "../conversation-surface/definition";
import { conversationDataSourcePlugin } from "../conversation-data-source/definition";
import { workspaceInspectorPlugin } from "../workspace-inspector/definition";

export const antdXTemplatePlugins = [
  conversationDataSourcePlugin,
  antdXThemeProviderPlugin,
  antdXThemeSwitchPlugin,
  antdXConversationsPlugin,
  antdXWelcomePlugin,
  agentMessageListPlugin,
  agentToolActivityPlugin,
  agentToolPlugin,
  antdXRunTimelinePlugin,
  antdXToolDetailPlugin,
  agentReasoningPlugin,
  antdXActivityFeedPlugin,
  antdXSourcesPlugin,
  antdXAttachmentsPlugin,
  antdXResourcesPlugin,
  antdXPromptsPlugin,
  agentComposerPlugin,
  conversationSurfacePlugin,
  workspaceInspectorPlugin,
] as const;

export {
  antdXActivityFeedPlugin,
  antdXAttachmentsPlugin,
  antdXConversationsPlugin,
  agentMessageListPlugin,
  agentReasoningPlugin,
  antdXPromptsPlugin,
  antdXResourcesPlugin,
  antdXRunTimelinePlugin,
  agentComposerPlugin,
  antdXSourcesPlugin,
  antdXThemeProviderPlugin,
  antdXThemeSwitchPlugin,
  antdXToolDetailPlugin,
  agentToolActivityPlugin,
  agentToolPlugin,
  antdXWelcomePlugin,
  conversationDataSourcePlugin,
  conversationSurfacePlugin,
  workspaceInspectorPlugin,
};

export { AntdXActivityFeedPlugin } from "../antd-x-activity-feed";
export { AntdXAttachmentsPlugin } from "../antd-x-attachments";
export { AntdXConversationsPlugin } from "../antd-x-conversations";
export { AgentMessageListPlugin } from "../agent-message-list";
export { AgentReasoningPlugin } from "../agent-reasoning";
export { AntdXPromptsPlugin } from "../antd-x-prompts";
export { AntdXResourcesPlugin } from "../antd-x-resources";
export { AntdXRunTimelinePlugin } from "../antd-x-run-timeline";
export { AgentComposerPlugin } from "../agent-composer";
export { AntdXSourcesPlugin } from "../antd-x-sources";
export { AntdXThemeProviderPlugin } from "../antd-x-theme-provider";
export { AntdXThemeSwitchPlugin } from "../antd-x-theme-switch";
export { AntdXToolDetailPlugin } from "../antd-x-tool-detail";
export { AgentToolActivityPlugin } from "../agent-tool-activity";
export { AgentToolPlugin } from "../agent-tool";
export { AntdXWelcomePlugin } from "../antd-x-welcome";
export { ConversationSurfacePlugin } from "../conversation-surface";
export { ConversationDataSourcePlugin } from "../conversation-data-source";
export { WorkspaceInspectorPlugin } from "../workspace-inspector";
export * from "../../services/agent-ui-theme";
