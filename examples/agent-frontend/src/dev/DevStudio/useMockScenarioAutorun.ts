import { useEffect } from "react";

import { useAgentRuntimeActions } from "../../../runtime/context";
import {
  isMockAgentEndpoint,
  MOCK_SCENARIO_AUTORUN_TRIGGER,
} from "../../agent-endpoint";

/** Keeps the mock run lifecycle alive even when the Scenario tab is not mounted. */
export function useMockScenarioAutorun(
  endpoint: string | undefined,
  runRevision: number,
): void {
  const { sendMessage } = useAgentRuntimeActions();

  useEffect(() => {
    if (!isMockAgentEndpoint(endpoint)) return;
    if (runRevision === 0) return;

    const timeout = window.setTimeout(() => {
      void sendMessage(MOCK_SCENARIO_AUTORUN_TRIGGER);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [endpoint, runRevision, sendMessage]);
}
