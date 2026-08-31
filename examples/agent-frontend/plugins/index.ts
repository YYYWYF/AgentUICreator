import { antdXConversationsPlugin } from "./antd-x-conversations/definition";
import { antdXMessageListPlugin } from "./antd-x-message-list/definition";
import { antdXNewConversationPlugin } from "./antd-x-new-conversation/definition";
import { antdXPromptsPlugin } from "./antd-x-prompts/definition";
import { antdXResourcesPlugin } from "./antd-x-resources/definition";
import { antdXRunTimelinePlugin } from "./antd-x-run-timeline/definition";
import { antdXSenderPlugin } from "./antd-x-sender/definition";
import { antdXThemeProviderPlugin } from "./antd-x-theme-provider/definition";
import { antdXThemeSwitchPlugin } from "./antd-x-theme-switch/definition";
import { antdXToolDetailPlugin } from "./antd-x-tool-detail/definition";
import { antdXWelcomePlugin } from "./antd-x-welcome/definition";
import { chatPlugin } from "./chat/definition";
import { filePreviewPlugin } from "./file-preview/definition";

export const pluginDefinitions = [
  antdXThemeProviderPlugin,
  antdXThemeSwitchPlugin,
  antdXConversationsPlugin,
  antdXNewConversationPlugin,
  antdXWelcomePlugin,
  antdXMessageListPlugin,
  antdXRunTimelinePlugin,
  antdXToolDetailPlugin,
  antdXResourcesPlugin,
  antdXPromptsPlugin,
  antdXSenderPlugin,
  chatPlugin,
  filePreviewPlugin,
] as const;
