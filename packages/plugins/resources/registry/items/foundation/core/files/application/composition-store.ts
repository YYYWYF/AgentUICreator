import { createRuntimeCompositionStore, type AgentUIProjectOptions } from '@za38.03/agent-ui-runtime/ui';

/** A stable dependency: model/config hot updates reuse the last valid composition. */
export const agentCompositionStore: AgentUIProjectOptions['compositionStore'] = createRuntimeCompositionStore();
