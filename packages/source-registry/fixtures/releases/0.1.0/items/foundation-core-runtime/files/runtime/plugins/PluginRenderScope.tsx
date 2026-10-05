import { createContext, useContext, type ReactNode } from "react";

import type { UIPluginRenderScope } from "../../framework/contracts/ui-plugin";

const PluginRenderScopeContext = createContext<UIPluginRenderScope | null>(null);

export function PluginRenderScopeProvider({
  scope,
  children,
}: {
  scope: UIPluginRenderScope;
  children: ReactNode;
}) {
  return (
    <PluginRenderScopeContext.Provider value={scope}>
      {children}
    </PluginRenderScopeContext.Provider>
  );
}

export function usePluginRenderScope<T = unknown>(): UIPluginRenderScope<T> | null {
  return useContext(PluginRenderScopeContext) as UIPluginRenderScope<T> | null;
}
