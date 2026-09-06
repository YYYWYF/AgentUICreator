import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { PluginInstance } from "../../framework/contracts/app-ui-model";
import type {
  UIPluginActions,
  UIPluginEvents,
} from "../../framework/contracts/ui-plugin";

export interface PluginInstanceContextValue {
  instance: PluginInstance;
  actions: UIPluginActions;
  events: UIPluginEvents;
}

const PluginInstanceContext =
  createContext<PluginInstanceContextValue | null>(null);

export interface PluginInstanceProviderProps extends PluginInstanceContextValue {
  children: ReactNode;
}

export function PluginInstanceProvider({
  instance,
  actions,
  events,
  children,
}: PluginInstanceProviderProps) {
  const value = useMemo(
    () => ({ instance, actions, events }),
    [actions, events, instance],
  );
  return (
    <PluginInstanceContext.Provider value={value}>
      {children}
    </PluginInstanceContext.Provider>
  );
}

function useRequiredPluginInstanceContext(): PluginInstanceContextValue {
  const context = useContext(PluginInstanceContext);
  if (context === null) {
    throw new Error("PluginInstanceProvider is missing");
  }
  return context;
}

export function usePluginInstance(): PluginInstance {
  return useRequiredPluginInstanceContext().instance;
}

export function usePluginActions(): UIPluginActions {
  return useRequiredPluginInstanceContext().actions;
}

export function usePluginEvents(): UIPluginEvents {
  return useRequiredPluginInstanceContext().events;
}
