import type { ConversationStarterSuggestion } from "@agent-ui/runtime-conversation";

/** Host-owned endpoint. Set this when integrating Agent UI with your application. */
export const conversationDataEndpoint: string | undefined = undefined;

export const conversationStarterSuggestions = [
  {
    title: "分析 Agent UI 架构",
    label: "检查布局、Plugin 与 Service 边界",
    prompt: "帮我分析当前 Agent UI 架构",
  },
  {
    title: "调试当前问题",
    label: "定位当前界面的异常行为",
    prompt: "帮我调试当前界面的问题",
  },
  {
    title: "建议下一步",
    label: "给出一个可执行的后续动作",
    prompt: "根据当前上下文建议下一步",
  },
] satisfies readonly ConversationStarterSuggestion[];
