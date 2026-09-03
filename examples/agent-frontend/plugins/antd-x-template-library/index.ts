import { antdXActivityFeedPlugin } from "../antd-x-activity-feed/definition";
import { antdXAttachmentsPlugin } from "../antd-x-attachments/definition";
import { antdXConversationsPlugin } from "../antd-x-conversations/definition";
import { antdXMessageListPlugin } from "../antd-x-message-list/definition";
import { antdXNewConversationPlugin } from "../antd-x-new-conversation/definition";
import { antdXPromptsPlugin } from "../antd-x-prompts/definition";
import { antdXReasoningPlugin } from "../antd-x-reasoning/definition";
import { antdXResourcesPlugin } from "../antd-x-resources/definition";
import { antdXRunTimelinePlugin } from "../antd-x-run-timeline/definition";
import { antdXSenderPlugin } from "../antd-x-sender/definition";
import { antdXSourcesPlugin } from "../antd-x-sources/definition";
import { antdXThemeProviderPlugin } from "../antd-x-theme-provider/definition";
import { antdXThemeSwitchPlugin } from "../antd-x-theme-switch/definition";
import { antdXToolDetailPlugin } from "../antd-x-tool-detail/definition";
import { antdXWelcomePlugin } from "../antd-x-welcome/definition";
import { conversationSurfacePlugin } from "../conversation-surface/definition";

export const antdXTemplatePlugins = [
  antdXThemeProviderPlugin,
  antdXThemeSwitchPlugin,
  antdXConversationsPlugin,
  antdXNewConversationPlugin,
  antdXWelcomePlugin,
  antdXMessageListPlugin,
  antdXRunTimelinePlugin,
  antdXToolDetailPlugin,
  antdXReasoningPlugin,
  antdXActivityFeedPlugin,
  antdXSourcesPlugin,
  antdXAttachmentsPlugin,
  antdXResourcesPlugin,
  antdXPromptsPlugin,
  antdXSenderPlugin,
  conversationSurfacePlugin,
] as const;

export {
  antdXActivityFeedPlugin,
  antdXAttachmentsPlugin,
  antdXConversationsPlugin,
  antdXMessageListPlugin,
  antdXNewConversationPlugin,
  antdXPromptsPlugin,
  antdXReasoningPlugin,
  antdXResourcesPlugin,
  antdXRunTimelinePlugin,
  antdXSenderPlugin,
  antdXSourcesPlugin,
  antdXThemeProviderPlugin,
  antdXThemeSwitchPlugin,
  antdXToolDetailPlugin,
  antdXWelcomePlugin,
  conversationSurfacePlugin,
};

export { AntdXActivityFeedPlugin } from "../antd-x-activity-feed";
export { AntdXAttachmentsPlugin } from "../antd-x-attachments";
export { AntdXConversationsPlugin } from "../antd-x-conversations";
export { AntdXMessageListPlugin } from "../antd-x-message-list";
export { AntdXNewConversationPlugin } from "../antd-x-new-conversation";
export { AntdXPromptsPlugin } from "../antd-x-prompts";
export { AntdXReasoningPlugin } from "../antd-x-reasoning";
export { AntdXResourcesPlugin } from "../antd-x-resources";
export { AntdXRunTimelinePlugin } from "../antd-x-run-timeline";
export { AntdXSenderPlugin } from "../antd-x-sender";
export { AntdXSourcesPlugin } from "../antd-x-sources";
export { AntdXThemeProviderPlugin } from "../antd-x-theme-provider";
export { AntdXThemeSwitchPlugin } from "../antd-x-theme-switch";
export { AntdXToolDetailPlugin } from "../antd-x-tool-detail";
export { AntdXWelcomePlugin } from "../antd-x-welcome";
export { ConversationSurfacePlugin } from "../conversation-surface";
export * from "../antd-x-theme-provider/theme-service";
