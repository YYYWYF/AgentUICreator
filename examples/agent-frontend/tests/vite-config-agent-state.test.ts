import type { MockScenario } from "@agent-ui/mock-agent";
import { describe, expect, it } from "vitest";

import { previewAgentState } from "../src/preview-data";
import { withPreviewAgentState } from "../vite.config";

const scenarioWithoutState: MockScenario = {
  id: "scenario-a",
  title: "Scenario A",
  initialState: undefined,
  steps: [],
};

const scenarioWithState: MockScenario = {
  id: "scenario-b",
  title: "Scenario B",
  initialState: {
    trip: {
      destination: "Osaka",
    },
  },
  steps: [],
};

describe("Agent Frontend mock scenario preview state", () => {
  it("injects previewAgentState only when a scenario has no initialState", () => {
    const [withPreviewState, withOwnedState] = [
      scenarioWithoutState,
      scenarioWithState,
    ].map(withPreviewAgentState);

    expect(withPreviewState.initialState).toEqual(previewAgentState);
    expect(withOwnedState.initialState).toEqual(scenarioWithState.initialState);
  });
});
