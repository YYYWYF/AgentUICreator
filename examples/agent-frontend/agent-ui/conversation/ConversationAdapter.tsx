import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

import type { ConversationThreadComponents } from "@agent-ui/react";
import { useConversationPresentationConfig } from "./config";
import { useAgentUIThemeMode } from "../theme/useAgentUITheme";
import { ConversationSurface } from "./ConversationSurface";

export interface ConversationEmptyStateProps {
  welcome?: ReactNode;
  suggestions?: ReactNode;
}

const ConversationEmptyStateContext = createContext<ConversationEmptyStateProps>({});

function ConversationEmptyState() {
  const { welcome, suggestions } = useContext(ConversationEmptyStateContext);

  return (
    <div className="conversation-empty-state flex w-full flex-col items-center">
      <div className="conversation-empty-state-welcome w-full">
        {welcome}
      </div>
      <div className="conversation-empty-state-suggestions w-full">
        {suggestions}
      </div>
    </div>
  );
}

export function ConversationWelcomeFallback() {
  const { welcome } = useConversationPresentationConfig();
  return (
    <div className="aui-thread-welcome-root mb-6 flex flex-col items-center px-4 text-center">
      <h1 className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-2xl font-medium tracking-tight duration-200">
        {welcome.title ?? "How can I help you today?"}
      </h1>
      {welcome.description === undefined ? null : (
        <p className="text-muted-foreground fade-in slide-in-from-bottom-1 animate-in fill-mode-both mt-2 max-w-xl text-sm leading-6 duration-200">
          {welcome.description}
        </p>
      )}
    </div>
  );
}

export function createConversationSemanticThreadComponents(): ConversationThreadComponents {
  return { Welcome: ConversationEmptyState };
}

export function ConversationAdapter({
  welcome,
  suggestions,
}: ConversationEmptyStateProps = {}) {
  const theme = useAgentUIThemeMode();
  const components = useMemo(() => createConversationSemanticThreadComponents(), []);
  const emptyState = useMemo(
    () => ({ welcome, suggestions }),
    [welcome, suggestions],
  );
  return (
    <ConversationEmptyStateContext.Provider value={emptyState}>
      <ConversationSurface components={components} theme={theme} />
    </ConversationEmptyStateContext.Provider>
  );
}
