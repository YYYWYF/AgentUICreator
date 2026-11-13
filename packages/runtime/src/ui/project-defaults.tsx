import type { ReactNode } from "react";
import { createConversationToolkit } from "../plugin-api/index.js";
import type { AgentUIProjectOptions } from "./project-context.js";
import { createRuntimeCompositionStore, type RuntimeCompositionSnapshot } from "./runtime/composition/RuntimeCompositionStore.js";
import type { AppAgentState } from "./agent-contract/agent-state.js";

/** Structural Vite HMR port; npm has no bundler dependency. */
export interface AgentUIProjectHotContext {
  data: Record<string, unknown>;
  dispose(callback: () => void): void;
}
export type CreateAgentUIProjectOptions = Pick<AgentUIProjectOptions,
  "appUIModelSource" | "pluginCapabilityCatalog" | "capabilityCatalogRevision"> &
  Partial<AgentUIProjectOptions> & { hot?: AgentUIProjectHotContext | undefined };

const emptyToolkit = createConversationToolkit({});
function PassThrough({ children }: { children: ReactNode }) { return children; }

/** One source of defaults. Projects specify only their own overrides and integrations. */
export function createAgentUIProject({ hot, ...options }: CreateAgentUIProjectOptions): AgentUIProjectOptions {
  const compositionStore = options.compositionStore ?? createRuntimeCompositionStore<AppAgentState>(
    hot?.data.agentCompositionSnapshot as RuntimeCompositionSnapshot<AppAgentState> | undefined,
  );
  if (hot) {
    const data = hot.data;
    data.agentCompositionStore = compositionStore;
    hot.dispose(compositionStore.subscribe(() => {
      if (data.agentCompositionStore === compositionStore) data.agentCompositionSnapshot = compositionStore.getSnapshot();
    }));
  }
  return {
    appFrontendTools: [], appEventSchemas: {}, baseConversationToolkit: emptyToolkit,
    Integrations: PassThrough, conversationServices: {}, conversationMessageQueueEnabled: false,
    defaultLocale: "zh-CN", locales: { "en-US": {}, "zh-CN": {} },
    shell: {},
    getConversationStarterSuggestions: () => [],
    ...options, compositionStore,
  };
}

type ProjectResources = Pick<AgentUIProjectOptions, "appFrontendTools" | "generatedFrontendToolUIs" | "Integrations">;
/** Inputs are explicit build-time imports of Operator outputs, never runtime discovery. */
export function resolveAgentUIProjectResources(modules: Record<string, unknown>): Partial<ProjectResources> {
  const result: Partial<ProjectResources> = {};
  for (const module of Object.values(modules)) {
    const value = module as Record<string, unknown>;
    for (const [source, target] of [["generatedFrontendTools", "appFrontendTools"], ["generatedFrontendToolUIs", "generatedFrontendToolUIs"], ["GeneratedConversationIntegrations", "Integrations"]] as const) {
      if (value[source] === undefined) continue;
      if (Object.hasOwn(result, target)) throw new Error(`Duplicate Agent UI resource export: ${source}`);
      Object.assign(result, { [target]: value[source] });
    }
  }
  return result;
}
