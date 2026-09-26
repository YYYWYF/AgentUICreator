export type AgentUILocaleCode = "zh-CN" | "en-US";

export type AgentUIDirection = "ltr" | "rtl";

export interface AgentUILocaleMessages {
  frontendTools: {
    close: string;
    opening: string;
    opened: string;
    failed: string;
  };
  threadList: {
    newThread: string;
    newChat: string;
    search: string;
    moreOptions: string;
    running: string;
    rename: string;
    archive: string;
    delete: string;
  };
  theme: {
    settings: string;
    switchToLight: string;
    switchToDark: string;
  };
}
