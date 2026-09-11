import { defineScenario } from "../scenario.js";

export const reasoningLongPreviewScenario = defineScenario({
  id: "reasoning-long-preview",
  title: "Long Reasoning Preview",
  description: "持续流式输出超出预览高度的 reasoning，用于检查跟随、滚动接管和完成态。",
  steps: [
    {
      type: "reasoning",
      durationMs: 10_000,
      text: [
        "我先梳理当前请求的约束、数据来源和组件边界。",
        "第一步，确认 AG-UI reasoning 事件仍由 runtime-agui 投影，而不是由界面猜测状态。",
        "第二步，确认 runtime-core 中的 reasoning execution 是 running、completed 与 interrupted 的唯一事实来源。",
        "第三步，检查 MessageRenderContext 是否把 message、execution 和 running 稳定交给 renderer plugin。",
        "第四步，保持 AgentReasoning 为纯 Presentation，只通过 props、DOM refs 和稳定 data-slot 暴露能力。",
        "第五步，把 disclosure ownership 放在 Plugin Controller：streaming 临时控制，用户第一次操作后永久接管。",
        "第六步，观察长文本增长时内部 viewport 是否持续贴住最新 token，同时不影响 Thread 自己的滚动策略。",
        "第七步，模拟用户向上阅读历史 reasoning，确认后续 token 不会把阅读位置强制拖回底部。",
        "第八步，用户主动回到底部后恢复自动跟随，并继续观察剩余 token 的流式追加。",
        "第九步，结束 reasoning，确认 shimmer、aria-busy、底部 fade 和 live preview 行为一起停止。",
        "最后，确认 disclosure 回到 resting state，整个 Thread 在高度动画期间保持原来的 scrollTop。",
      ].join("\n\n"),
    },
    {
      type: "message",
      text: "长 reasoning 预览已完成，可以检查完成态和 Thread 位置。",
      intervalMs: 35,
    },
  ],
});
