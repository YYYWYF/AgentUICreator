import {
  createContext,
  useContext,
  type PropsWithChildren,
} from "react";

import type { AssistantUiPresentationConfig } from "./assistant-ui-presentation-config";

const EMPTY_ASSISTANT_UI_PRESENTATION_CONFIG: AssistantUiPresentationConfig = {
  welcome: {},
  starterSuggestions: [],
  composer: { quickPrompts: [] },
};

const AssistantUiPresentationConfigContext =
  createContext<AssistantUiPresentationConfig>(
    EMPTY_ASSISTANT_UI_PRESENTATION_CONFIG,
  );

export interface AssistantUiPresentationConfigProviderProps {
  value: AssistantUiPresentationConfig;
}

export function AssistantUiPresentationConfigProvider({
  children,
  value,
}: PropsWithChildren<AssistantUiPresentationConfigProviderProps>) {
  return (
    <AssistantUiPresentationConfigContext.Provider value={value}>
      {children}
    </AssistantUiPresentationConfigContext.Provider>
  );
}

export function useAssistantUiPresentationConfig(): AssistantUiPresentationConfig {
  return useContext(AssistantUiPresentationConfigContext);
}
