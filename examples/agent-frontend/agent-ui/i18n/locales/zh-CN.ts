import type { AgentUILocaleMessages } from "../locale-types";

export const zhCN = {
  threadList: {
    newThread: "新建会话",
    newChat: "新会话",
    search: "搜索会话",
  },
  composer: {
    placeholder: "输入消息...",
    send: "发送",
    stop: "停止生成",
  },
  messageActions: {
    copy: "复制",
    copied: "已复制",
    reload: "重新生成",
    exportMarkdown: "导出 Markdown",
    previous: "上一条",
    next: "下一条",
  },
  theme: {
    settings: "主题设置",
    switchToLight: "切换到浅色模式",
    switchToDark: "切换到深色模式",
  },
} satisfies AgentUILocaleMessages;
