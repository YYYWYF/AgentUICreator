import type { AppAgentState } from "../agent-contract/agent-state";
import { createRuntimeCompositionStore } from "../runtime/composition";

/** Kept in a module that is not invalidated by authoring-input HMR. */
export const runtimeCompositionStore =
  createRuntimeCompositionStore<AppAgentState>();
