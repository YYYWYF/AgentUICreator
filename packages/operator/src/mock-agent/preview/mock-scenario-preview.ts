import type { MockScenario } from "../scenario.js";

import { previewAgentState } from "./preview-data.js";

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
