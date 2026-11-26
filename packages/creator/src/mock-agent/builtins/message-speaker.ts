import { defineScenario } from "../scenario.js";

// Self-contained fixture image: no network request or external image service.
const createAvatarUrl = (color: string): string => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><rect width="80" height="80" rx="40" fill="${color}"/><rect x="18" y="25" width="44" height="34" rx="12" fill="white"/><path d="M40 16v9M31 49h18" stroke="white" stroke-width="4" stroke-linecap="round"/><circle cx="31" cy="38" r="4" fill="${color}"/><circle cx="49" cy="38" r="4" fill="${color}"/></svg>`)}`;

export const messageSpeakerScenario = defineScenario({
  id: "message-speaker",
  title: "Two experts in one response",
  description: "同一次请求中先展示专家1的思考和回答，再切换到专家2，分别保留各自的头像、名称和内容。",
  category: "basics",
  resources: ["reasoning"],
  capabilities: ["reasoning"],
  reference: {
    audience: "backend",
    protocol: "AG-UI",
    pattern: "Event Speaker Metadata",
    presentation: "Message Speaker Identity",
    eventFlow: ["RUN_STARTED", "CUSTOM · metadata.speaker", "REASONING_*", "TEXT_MESSAGE_START/CONTENT/END", "CUSTOM · metadata.speaker", "REASONING_*", "TEXT_MESSAGE_START/CONTENT/END", "RUN_FINISHED"],
  },
  steps: [{
    type: "custom",
    name: "speaker-selected",
    value: {},
    metadata: { speaker: { id: "frontend-expert", name: "专家1 · 前端开发", avatarUrl: createAvatarUrl('#2563eb') } },
  }, {
    type: "reasoning",
    text: "这是专家1的模拟思考。我先从前端实现角度整理消息结构、组件边界和流式更新方式。",
    durationMs: 5000,
  }, {
    type: "message",
    intervalMs: 100,
    text: "我是专家1，负责前端实现。\n\n建议先确定消息数据结构和组件边界，再实现流式更新。切换专家时，应保留已经显示的内容和身份。",
  }, {
    type: "custom",
    name: "speaker-selected",
    value: {},
    metadata: { speaker: { id: "design-expert", name: "专家2 · 界面设计", avatarUrl: createAvatarUrl('#7c3aed') } },
  }, {
    type: "reasoning",
    text: "这是专家2的模拟思考。我会从界面设计角度补充建议，考虑如何让两位专家的身份和内容清楚易读。",
    durationMs: 4000,
  }, {
    type: "message",
    intervalMs: 100,
    text: "我是专家2，负责界面设计。\n\n建议用不同头像和清晰名称区分专家，正文保持统一排版。现在上方应保留专家1的建议，下方是我的设计建议；两段内容属于同一次回复。",
  }],
});
