import type { MockScenarioSummary } from "@agent-ui/mock-agent";

export const CREATOR_MOCK_API_PATH = "/__agent-ui/creator/mock";

export interface CreatorMockState {
  status: "stopped" | "running";
  endpoint: string | null;
  scenarioId: string;
  speed: number;
  scenarios: MockScenarioSummary[];
}
