import { defineScenario, type MockStateDelta } from "../scenario.js";

const cloneDelta: MockStateDelta = [
  {
    op: "replace",
    path: "/jobs/ci-job-1/stageProgress",
    value: 0.7,
  },
  {
    op: "replace",
    path: "/jobs/ci-job-1/eta",
    value: "about 3 min",
  },
];

const installDelta: MockStateDelta = [
  {
    op: "replace",
    path: "/jobs/ci-job-1/stageIndex",
    value: 1,
  },
  {
    op: "replace",
    path: "/jobs/ci-job-1/stageProgress",
    value: 0.3,
  },
  {
    op: "replace",
    path: "/jobs/ci-job-1/eta",
    value: "about 3 min",
  },
];

const buildDelta: MockStateDelta = [
  {
    op: "replace",
    path: "/jobs/ci-job-1/stageIndex",
    value: 2,
  },
  {
    op: "replace",
    path: "/jobs/ci-job-1/stageProgress",
    value: 0.55,
  },
  {
    op: "replace",
    path: "/jobs/ci-job-1/eta",
    value: "about 2 min",
  },
];

const testDelta: MockStateDelta = [
  {
    op: "replace",
    path: "/jobs/ci-job-1/stageIndex",
    value: 3,
  },
  {
    op: "replace",
    path: "/jobs/ci-job-1/stageProgress",
    value: 0.75,
  },
  {
    op: "replace",
    path: "/jobs/ci-job-1/eta",
    value: "less than 1 min",
  },
];

const completeDelta: MockStateDelta = [
  {
    op: "replace",
    path: "/jobs/ci-job-1/stageIndex",
    value: 4,
  },
  {
    op: "replace",
    path: "/jobs/ci-job-1/stageProgress",
    value: 0,
  },
];

const runCiJobArgs = {
  target: "Verify the current change on CI",
  stages: [
    { name: "clone", weight: 1 },
    { name: "install", weight: 3 },
    { name: "build", weight: 3 },
    { name: "test", weight: 3 },
  ],
};

export const agentStateSyncScenario = defineScenario({
  id: "agent-state-sync",
  title: "AG-UI State → Job Progress",
  description: "使用 ToolCall 锚定 CI Job，再通过 STATE_DELTA 实时推进 transcript 中的 assistant-ui JobProgress。",
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
      "TOOL_CALL_START",
      "TOOL_CALL_ARGS",
      "TOOL_CALL_END",
      "STATE_DELTA",
      "STATE_DELTA",
      "STATE_DELTA",
      "STATE_DELTA",
      "STATE_DELTA",
      "TOOL_CALL_RESULT",
      "TEXT_MESSAGE_START/CONTENT/END",
      "RUN_FINISHED",
    ],
    notes: [
      "The run_ci_job ToolCall anchors the job in the conversation transcript and gives it an identity.",
      "STATE_SNAPSHOT initializes the dynamic state associated with ci-job-1.",
      "STATE_DELTA updates jobs[toolCallId] while the ToolCall is still running.",
      "STATE_DELTA carries standard JSON Patch operations for each stage update.",
      "TOOL_CALL_RESULT reports the one-shot terminal outcome after the live state settles.",
      "ToolCall and State solve different problems and can be combined.",
      "Use ToolCall for the action, STATE_* for mutable state, and TOOL_CALL_RESULT for the terminal result.",
      "State lifecycle and UI placement are separate: this CI job belongs in the ToolCall transcript, not a global status area.",
      "JobProgress is used through the mock toolkit's named Tool UI and official assistant-ui facade.",
      "The latest state is included in the next AG-UI run input.",
      "Dev Studio → Runtime → Application State shows the raw current state.",
      "AG-UI state is not AppUIModel, app-ui.json, Plugin configuration, ConversationService, conversation persistence, or Creator working state.",
      "initialState is emitted as STATE_SNAPSHOT only for the initial run; resume keeps the same runtime continuity.",
    ],
  },
  initialState: {
    jobs: {
      "ci-job-1": {
        stageIndex: 0,
        stageProgress: 0.1,
        eta: "about 4 min",
      },
    },
  },
  steps: [
    {
      type: "message",
      text: "我来运行 CI 验证。",
    },
    {
      type: "tool",
      name: "run_ci_job",
      toolCallId: "ci-job-1",
      args: runCiJobArgs,
      prepareDurationMs: 400,
      durationMs: 0,
      during: [
        { type: "state-delta", delta: cloneDelta, delayMs: 700 },
        { type: "state-delta", delta: installDelta, delayMs: 700 },
        { type: "state-delta", delta: buildDelta, delayMs: 700 },
        { type: "state-delta", delta: testDelta, delayMs: 700 },
        { type: "state-delta", delta: completeDelta, delayMs: 700 },
      ],
      result: {
        success: true,
        summary: "All CI stages passed",
      },
    },
    {
      type: "message",
      text: "CI 验证完成，所有阶段通过。",
    },
  ],
});
