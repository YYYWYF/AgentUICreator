import { antdXMessageListPlugin } from "../antd-x-message-list/definition";
import { antdXPromptsPlugin } from "../antd-x-prompts/definition";
import { antdXSenderPlugin } from "../antd-x-sender/definition";
import { antdXThemeProviderPlugin } from "../antd-x-theme-provider/definition";
import { antdXThemeSwitchPlugin } from "../antd-x-theme-switch/definition";
import { antdXWelcomePlugin } from "../antd-x-welcome/definition";

export const antdXTemplatePlugins = [
  antdXThemeProviderPlugin,
  antdXThemeSwitchPlugin,
  antdXWelcomePlugin,
  antdXMessageListPlugin,
  antdXPromptsPlugin,
  antdXSenderPlugin,
] as const;

export {
  antdXMessageListPlugin,
  antdXPromptsPlugin,
  antdXSenderPlugin,
  antdXThemeProviderPlugin,
  antdXThemeSwitchPlugin,
  antdXWelcomePlugin,
};

export { AntdXMessageListPlugin } from "../antd-x-message-list";
export { AntdXPromptsPlugin } from "../antd-x-prompts";
export { AntdXSenderPlugin } from "../antd-x-sender";
export { AntdXThemeProviderPlugin } from "../antd-x-theme-provider";
export { AntdXThemeSwitchPlugin } from "../antd-x-theme-switch";
export { AntdXWelcomePlugin } from "../antd-x-welcome";
export * from "../antd-x-theme-provider/theme-service";
