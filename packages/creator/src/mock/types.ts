import type { MockScenarioSummary } from "@agent-ui/mock-agent";

export const CREATOR_MOCK_API_PATH = "/__agent-ui/creator/mock";

import type { LocalMockRecordingSummary } from "./local-recording-store.js";

export type CreatorMockSelection = { type: "builtin" | "recording"; id: string };

export interface CreatorMockState {
  status: "stopped" | "running";
  endpoint: string | null;
  scenarioId: string;
  selection: CreatorMockSelection;
  projectId: string | null;
  recordings: LocalMockRecordingSummary[];
  recordingsError?: string;
  speed: number;
  scenarios: Pick<MockScenarioSummary, "id" | "title" | "description" | "resources" | "category" | "capabilities">[];
}
