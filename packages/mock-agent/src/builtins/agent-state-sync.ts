import { defineScenario, type MockStateDelta } from "../scenario.js";

const researchingDelta: MockStateDelta = [
  {
    op: "replace",
    path: "/trip/status",
    value: "researching",
  },
  {
    op: "add",
    path: "/trip/budget",
    value: 1200,
  },
];

const readyDelta: MockStateDelta = [
  {
    op: "replace",
    path: "/trip/status",
    value: "ready",
  },
];

export const agentStateSyncScenario = defineScenario({
  id: "agent-state-sync",
  title: "AG-UI Agent State",
  description: "使用 STATE_SNAPSHOT 初始化 Agent external state，再通过 STATE_DELTA JSON Patch 增量更新状态。",
  category: "state",
  capabilities: ["state-sync"],
  reference: {
    protocol: "AG-UI",
    pattern: "Agent State Synchronization",
    presentation: "Dev Studio Runtime / Application State",
    level: "recommended",
    eventFlow: [
      "RUN_STARTED",
      "STATE_SNAPSHOT",
      "STATE_DELTA",
      "STATE_DELTA",
      "RUN_FINISHED",
    ],
    notes: [
      "STATE_SNAPSHOT replaces the complete external agent state; it is not a merge.",
      "STATE_DELTA applies JSON Patch operations to the current state.",
      "The state is projected by react-ag-ui into assistant-ui thread.state.",
      "AgentUICreator observes the same state through AgentRuntimeSnapshot.state.",
      "AG-UI state is not AppUIModel, app-ui.json, Plugin configuration, ConversationService, conversation persistence, or Creator working state.",
      "Run the scenario and watch the live value in Dev Studio → Runtime → Application State.",
      "initialState is emitted as STATE_SNAPSHOT only for the initial run; resume keeps the same runtime continuity.",
    ],
  },
  initialState: {
    trip: {
      destination: "Tokyo",
      days: 5,
      status: "planning",
    },
  },
  steps: [
    {
      type: "message",
      text: "我已经读取旅行需求，开始规划。",
    },
    {
      type: "state-delta",
      delta: researchingDelta,
      delayMs: 700,
    },
    {
      type: "message",
      text: "预算和旅行约束已经确认。",
    },
    {
      type: "state-delta",
      delta: readyDelta,
      delayMs: 700,
    },
    {
      type: "message",
      text: "旅行规划状态已经准备完成。",
    },
  ],
});
