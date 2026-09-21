import { defineScenario, type MockStateDelta } from "../scenario.js";

const cloneDelta: MockStateDelta = [
  {
    op: "replace",
    path: "/jobProgress/stageProgress",
    value: 0.7,
  },
  {
    op: "replace",
    path: "/jobProgress/eta",
    value: "about 3 min",
  },
];

const installDelta: MockStateDelta = [
  {
    op: "replace",
    path: "/jobProgress/stageIndex",
    value: 1,
  },
  {
    op: "replace",
    path: "/jobProgress/stageProgress",
    value: 0.3,
  },
  {
    op: "replace",
    path: "/jobProgress/eta",
    value: "about 3 min",
  },
];

const buildDelta: MockStateDelta = [
  {
    op: "replace",
    path: "/jobProgress/stageIndex",
    value: 2,
  },
  {
    op: "replace",
    path: "/jobProgress/stageProgress",
    value: 0.55,
  },
  {
    op: "replace",
    path: "/jobProgress/eta",
    value: "about 2 min",
  },
];

const testDelta: MockStateDelta = [
  {
    op: "replace",
    path: "/jobProgress/stageIndex",
    value: 3,
  },
  {
    op: "replace",
    path: "/jobProgress/stageProgress",
    value: 0.75,
  },
  {
    op: "replace",
    path: "/jobProgress/eta",
    value: "less than 1 min",
  },
];

const completeDelta: MockStateDelta = [
  {
    op: "replace",
    path: "/jobProgress/stageIndex",
    value: 4,
  },
  {
    op: "replace",
    path: "/jobProgress/stageProgress",
    value: 0,
  },
];

export const agentStateSyncScenario = defineScenario({
  id: "agent-state-sync",
  title: "AG-UI State → Job Progress",
  description: "使用 STATE_SNAPSHOT 初始化一个持续运行的 CI Job，再通过 STATE_DELTA 实时推进 assistant-ui JobProgress。",
  category: "state",
  capabilities: ["state-sync"],
  reference: {
    protocol: "AG-UI",
    pattern: "Live Job State Synchronization",
    presentation: "assistant-ui JobProgress + Dev Studio Runtime State",
    level: "recommended",
    eventFlow: [
      "RUN_STARTED",
      "STATE_SNAPSHOT",
      "TEXT_MESSAGE_START/CONTENT/END",
      "STATE_DELTA",
      "STATE_DELTA",
      "STATE_DELTA",
      "STATE_DELTA",
      "STATE_DELTA",
      "TEXT_MESSAGE_START/CONTENT/END",
      "RUN_FINISHED",
    ],
    notes: [
      "STATE_SNAPSHOT initializes the complete job state.",
      "STATE_DELTA updates the same job without producing new messages or tool results.",
      "STATE_DELTA carries standard JSON Patch operations for each stage update.",
      "JobProgress is used in assistant-ui standalone controlled mode.",
      "Tool results are one-shot and are not appropriate for continuous stage progress.",
      "The latest state is included in the next AG-UI run input.",
      "Dev Studio → Runtime → Application State shows the raw current state.",
      "AG-UI state is not AppUIModel, app-ui.json, Plugin configuration, ConversationService, conversation persistence, or Creator working state.",
      "Use STATE_* when a value persists beyond one message, changes repeatedly, later runs need it, and the UI should update in place.",
      "Prefer ToolCall when the interaction is an invocation with a terminal result and each update should remain as transcript history.",
      "initialState is emitted as STATE_SNAPSHOT only for the initial run; resume keeps the same runtime continuity.",
    ],
  },
  initialState: {
    jobProgress: {
      id: "ci-verification",
      title: "Verify the current change on CI",
      stages: [
        { name: "clone", weight: 1 },
        { name: "install", weight: 3 },
        { name: "build", weight: 3 },
        { name: "test", weight: 3 },
      ],
      stageIndex: 0,
      stageProgress: 0.1,
      eta: "about 4 min",
    },
  },
  steps: [
    {
      type: "message",
      text: "我已经启动 CI 验证，进度会持续更新。",
    },
    {
      type: "state-delta",
      delta: cloneDelta,
      delayMs: 700,
    },
    {
      type: "state-delta",
      delta: installDelta,
      delayMs: 700,
    },
    {
      type: "state-delta",
      delta: buildDelta,
      delayMs: 700,
    },
    {
      type: "state-delta",
      delta: testDelta,
      delayMs: 700,
    },
    {
      type: "state-delta",
      delta: completeDelta,
      delayMs: 700,
    },
    {
      type: "message",
      text: "CI 验证完成，所有阶段通过。",
    },
  ],
});
