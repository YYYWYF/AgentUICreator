import type { AgentUILocaleMessages } from "../locale-types";

export const enUS = {
  threadList: {
    newThread: "New Thread",
    newChat: "New Chat",
    search: "Search threads",
  },
  composer: {
    placeholder: "Send a message...",
    send: "Send",
    stop: "Stop generating",
  },
  messageActions: {
    copy: "Copy",
    copied: "Copied",
    reload: "Refresh",
    exportMarkdown: "Export as Markdown",
    previous: "Previous",
    next: "Next",
  },
  theme: {
    settings: "Theme settings",
    switchToLight: "Switch to light mode",
    switchToDark: "Switch to dark mode",
  },
} satisfies AgentUILocaleMessages;
