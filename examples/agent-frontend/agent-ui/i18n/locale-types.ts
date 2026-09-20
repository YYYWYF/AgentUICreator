export type AgentUILocaleCode = "zh-CN" | "en-US";

export type AgentUIDirection = "ltr" | "rtl";

export interface AgentUILocaleMessages {
  threadList: {
    newThread: string;
    newChat: string;
    search: string;
  };
  composer: {
    placeholder: string;
    input: string;
    addAttachment: string;
    dictate: string;
    stopDictation: string;
    send: string;
    stop: string;
  };
  messageActions: {
    copy: string;
    copied: string;
    reload: string;
    exportMarkdown: string;
    previous: string;
    next: string;
  };
  theme: {
    settings: string;
    switchToLight: string;
    switchToDark: string;
  };
}
