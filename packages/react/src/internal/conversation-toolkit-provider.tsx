import { AuiConfig, AuiProvider, Tools, useAui, useAuiState } from "@assistant-ui/react";
import { useEffect, useMemo, type ReactNode } from "react";
import type { ConversationToolkit } from "../public.js";

type ToolUIs = ReturnType<ReturnType<typeof useAui>["tools"]["getState"]>["toolUIs"];

function InheritedRenderers({ inherited, toolkit }: { inherited: ToolUIs; toolkit: ConversationToolkit }) {
  const aui = useAui();
  useEffect(() => {
    const unsubscribes: (() => void)[] = [];
    // A fresh Tools scope replaces its parent's presentation registry. Preserve
    // installed Plugin/Frontend Tool renderers without re-registering permissions.
    for (const [name, registrations] of Object.entries(inherited)) {
      if (Object.hasOwn(toolkit, name)) continue;
      for (const registration of registrations) {
        unsubscribes.push(aui.tools.setToolUI(name, registration.render, {
          standalone: registration.standalone,
        }));
      }
    }
    return () => { unsubscribes.forEach(unsubscribe => unsubscribe()); };
  }, [aui, inherited, toolkit]);
  return null;
}

export function InternalConversationToolkitProvider({ toolkit, children }: {
  toolkit: ConversationToolkit;
  children: ReactNode;
}) {
  const aui = useAui();
  const inherited = useAuiState(state => state.tools.toolUIs);
  const config = useMemo(() => AuiConfig({ tools: Tools({ toolkit }) }), [toolkit]);
  return <AuiProvider extends={aui} config={config}>
    <InheritedRenderers inherited={inherited} toolkit={toolkit} />
    {children}
  </AuiProvider>;
}
