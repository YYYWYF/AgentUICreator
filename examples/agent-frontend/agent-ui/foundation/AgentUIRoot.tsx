import {
  useCallback,
  useMemo,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { AgentUIRootContext } from "./context";
import "../styles/tokens.css";
import "../styles/reset.css";

export type AgentUITheme = "light" | "dark";

export interface AgentUIRootProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  children: ReactNode;
  theme?: AgentUITheme;
}

export function AgentUIRoot({
  children,
  theme = "light",
  ...rootProps
}: AgentUIRootProps) {
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
  const portalRef = useCallback((node: HTMLDivElement | null) => {
    setPortalContainer(node);
  }, []);
  const context = useMemo(() => ({ portalContainer }), [portalContainer]);

  return (
    <AgentUIRootContext.Provider value={context}>
      <div {...rootProps} data-agent-ui-root data-agent-ui-theme={theme}>
        {portalContainer === null ? null : children}
        <div ref={portalRef} data-agent-ui-portal-host />
      </div>
    </AgentUIRootContext.Provider>
  );
}
