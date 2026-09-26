export type AgentUILocaleCode = "zh-CN" | "en-US";

export type AgentUIDirection = "ltr" | "rtl";

export interface AgentUILocaleMessages {
  auth: {
    demo: string;
    title: string;
    description: string;
    signIn: string;
    signingIn: string;
    failed: string;
    hint: string;
  };
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
