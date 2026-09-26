import type { AgentUILocaleMessages } from "../locale-types";

export const zhCN = {
  auth: {
    demo: "登录示意",
    title: "登录后开始使用",
    description: "点击下方按钮，以示例身份进入 Agent 工作台。",
    signIn: "模拟登录并进入",
    signingIn: "正在登录…",
    failed: "登录未完成，请重试。",
    hint: "暂未接入内部认证体系，刷新页面后需重新进入。",
  },
  threadList: {
    newThread: "新建会话",
    newChat: "新会话",
    search: "搜索会话",
  },
  theme: {
    settings: "主题设置",
    switchToLight: "切换到浅色模式",
    switchToDark: "切换到深色模式",
  },
} satisfies AgentUILocaleMessages;
