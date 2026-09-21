import type { MockScenario } from "@agent-ui/mock-agent";

import { previewAgentState } from "./preview-data";

/**
 * Keep the preview state available to every showcase while allowing a
 * scenario to own its domain-specific fields.
 */
export function withPreviewAgentState(scenario: MockScenario): MockScenario {
  return {
    ...scenario,
    initialState: {
      ...previewAgentState,
      ...(scenario.initialState ?? {}),
    },
  };
}
