export type AgentUILocaleCode = "zh-CN" | "en-US";

export type AgentUIDirection = "ltr" | "rtl";

export interface AgentUILocaleMessages {
  threadList: {
    newThread: string;
    newChat: string;
    search: string;
  };
  theme: {
    settings: string;
    switchToLight: string;
    switchToDark: string;
  };
}
