import type { AppAgentState } from "../agent-contract/agent-state";
import { createRuntimeCompositionStore } from "../runtime/composition";

/** Keep the last valid composition while Vite updates authored files. */
export const agentCompositionStore = createRuntimeCompositionStore<AppAgentState>();
