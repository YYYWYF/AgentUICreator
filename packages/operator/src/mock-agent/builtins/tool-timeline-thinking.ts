import { defineScenario } from "../scenario.js";
export const toolTimelineThinkingScenario = defineScenario({
  id: "tool-timeline-thinking",
  title: "Thinking → Tool Timeline → Answer",
  description: "切换 ThinkingIndicator-only、Reasoning-only、Both；展开三次同名工具的摘要及原始详情。",
  category: "tools", capabilities: ["reasoning", "tool"],
  resources: ["tool-timeline", "thinking-indicator", "reasoning", "tool-approval"],
  reference: { audience: "frontend", protocol: "AG-UI", pattern: "Reasoning → Sequential Tools → Answer",
    presentation: "Official message ToolTimeline + ThinkingIndicator",
    notes: ["Enable ThinkingIndicator and disable the Reasoning display instance to observe placeholder-only mode; runtime reasoning remains intact.", "Use existing tool-error, approval-resume, web-search and nested-subagent demos to compare protected and dedicated tool UIs."] },
  steps: [
    { type: "reasoning", text: "检查三个配置文件，再给出回答。", durationMs: 4000 },
    { type: "tool", name: "read_file", args: { path: "app-ui/app-ui.json" }, result: { found: true }, prepareDurationMs: 600, durationMs: 1600 },
    { type: "tool", name: "read_file", args: { path: "package.json" }, result: { found: true }, prepareDurationMs: 600, durationMs: 1600 },
    { type: "tool", name: "read_file", args: { path: "plugins/conversation-surface/manifest.json" }, result: { found: true }, prepareDurationMs: 600, durationMs: 1600 },
    { type: "message", text: "三个配置文件已读取完成。", intervalMs: 60 },
  ],
});
export const thinkingPlaceholderScenario = defineScenario({
  id: "thinking-placeholder",
  title: "Thinking Placeholder",
  description: "持续 reasoning 时的简洁占位演示；启用 ThinkingIndicator 并关闭 Reasoning 展示实例。",
  category: "basics", capabilities: ["reasoning"], resources: ["thinking-indicator"],
  reference: { audience: "frontend", protocol: "AG-UI", pattern: "Reasoning → Answer",
    presentation: "Official ThinkingIndicator; independent Reasoning display toggle",
    notes: ["The demo does not automatically disable existing plugins. Select indicator-only, reasoning-only or both through AppUIModel."] },
  steps: [
    { type: "reasoning", text: "这段思考数据仍然保存在会话 Runtime 中，简洁展示模式只隐藏正文。", durationMs: 6000 },
    { type: "message", text: "思考已完成，开始回答。", intervalMs: 80 },
  ],
});
