import type { AppAgentState } from "../agent-contract/agent-state";
import { createRuntimeCompositionStore } from "../runtime/composition";
import type { RuntimeCompositionSnapshot } from "../runtime/composition";

/** Keep the last valid composition while Vite updates authored files. */
export const agentCompositionStore = createRuntimeCompositionStore<AppAgentState>(
  import.meta.hot?.data.agentCompositionSnapshot as RuntimeCompositionSnapshot<AppAgentState> | undefined,
);

if (import.meta.hot) {
  const data = import.meta.hot.data;
  data.agentCompositionStore = agentCompositionStore;
  // Vite does not dispose every dependency when a parent accepts an update.
  // Save on publication, and ignore any pending result from the old module.
  const unsubscribe = agentCompositionStore.subscribe(() => {
    if (data.agentCompositionStore === agentCompositionStore) {
      data.agentCompositionSnapshot = agentCompositionStore.getSnapshot();
    }
  });
  import.meta.hot.dispose(unsubscribe);
}
