import { createContext, useContext, type ReactNode } from "react";
const Context = createContext<HTMLElement | null | undefined>(undefined);
export const useAgentUIPortalContainer = () => useContext(Context);
export function AgentUIPortalContainerProvider({
  container,
  children,
}: {
  container: HTMLElement | null | undefined;
  children: ReactNode;
}) {
  return <Context.Provider value={container}>{children}</Context.Provider>;
}
