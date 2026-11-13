import type {AgentUIPresentation} from "../presentation.js";
import { createContext, useContext, useEffect, useMemo, type ComponentType, type PropsWithChildren, type ReactNode, type RefCallback } from "react";
import { type AgentUILocaleCode, type AgentUILocaleOverrides, type AgentUILocaleMessages } from "../locale.js";
import { type ConversationToolkit } from "../plugin-api/index.js";
import type { ConversationRuntimeProviderProps, ConversationStarterSuggestion } from "@za38.03/agent-ui-runtime";
import type { RuntimeCompositionStore } from "./runtime/composition/RuntimeCompositionStore.js";
import type { PluginCapabilityCatalog } from "./runtime/composition/PluginCapabilityCatalog.js";
import type { AppEventSchemas } from "./runtime/events/AppEventRegistry.js";
import type { AppFrontendToolDefinition } from "./runtime/tools/AppFrontendToolRegistry.js";
import type { AppAgentState } from "./agent-contract/agent-state.js";
import { subscribeAgentUIObservationReplay } from "./application/observability.js";

/** A project-owned presentation container; hiding it must preserve children. */
export interface AgentUIShellProps {
  children: ReactNode;
  /** Register the visible container for observation; hidden content stays mounted. */
  surfaceRef?: RefCallback<HTMLElement> | undefined;
  assistantPanelWidth?: number | undefined;
}

/** All application decisions remain in project code. No generated module is imported by npm. */
export interface AgentUIProjectOptions {
  presentation?: AgentUIPresentation | undefined;
  appUIModelSource: string;
  revisionDescriptorSource?: string | undefined;
  pluginCapabilityCatalog: PluginCapabilityCatalog<AppAgentState>;
  capabilityCatalogRevision: string;
  compositionStore: RuntimeCompositionStore<AppAgentState>;
  appFrontendTools: readonly AppFrontendToolDefinition[];
  appEventSchemas: AppEventSchemas;
  generatedFrontendToolUIs?: ConversationRuntimeProviderProps["frontendToolUIs"];
  baseConversationToolkit: ConversationToolkit;
  Integrations: ComponentType<{ children: ReactNode }>;
  conversationServices: Pick<ConversationRuntimeProviderProps, "attachments" | "dictation" | "feedback" | "attachmentAdapter" | "dictationAdapter" | "feedbackAdapter">;
  /** Organizes suggestion items; all default copy comes from the resolved locale. */
  getConversationStarterSuggestions(locale: AgentUILocaleCode, messages: AgentUILocaleMessages["starterSuggestions"]): readonly ConversationStarterSuggestion[];
  conversationMessageQueueEnabled: boolean;
  defaultLocale: AgentUILocaleCode;
  locales: Record<AgentUILocaleCode, AgentUILocaleOverrides>;
  Shell?: ComponentType<AgentUIShellProps> | undefined;
  shell: { assistantPanelWidth?: number | undefined };
  development?: boolean | undefined;
  /** Host values replace only services provided by enabled Plugin instances. */
  serviceOverrides?: Readonly<Record<string, unknown>> | undefined;
}

type ProjectContext = AgentUIProjectOptions & { localeSnapshot: { locale: AgentUILocaleCode; direction: "ltr" } };
const Context = createContext<ProjectContext | null>(null);
export function AgentUIProjectProvider({ value, children }: PropsWithChildren<{ value: AgentUIProjectOptions }>) {
  const project = useMemo<ProjectContext>(() => ({ ...value, localeSnapshot: { locale: value.defaultLocale, direction: "ltr" } }), [value]);
  useEffect(() => value.development ? subscribeAgentUIObservationReplay() : undefined, [value.development]);
  return <Context.Provider value={project}>{children}</Context.Provider>;
}

/** Presentation helpers can also be used without the full application assembly. */
export function useOptionalAgentUIProject(): ProjectContext | null { return useContext(Context); }
export function useAgentUIProject(): ProjectContext {
  const project = useContext(Context);
  if (project) return project;
  throw new Error("AGENT_UI_PROJECT_PROVIDER_REQUIRED");
}
