import { useAgentUILocale } from "../i18n/useAgentUILocale";
import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

import type { ConversationThreadComponents, ConversationThreadLabels } from "@agent-ui/react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { useConversationPresentationConfig } from "./config";
import { useAgentUITheme } from "../theme/useAgentUITheme";
import { ConversationSurface } from "./ConversationSurface";
import {
  ScopedUserEditComposer,
  ScopedReasoningGroup,
  ScopedAssistantResponseFooter,
  ScopedRendererBridgeProvider,
  ScopedTaskGroup,
  ScopedToolFallback,
  ScopedToolGroup,
  ScopedToolTimeline,
} from "./ScopedRendererBridge";

export interface ConversationEmptyStateProps {
  welcome?: ReactNode;
  suggestions?: ReactNode;
  composer?: ReactNode;
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
  const messages = useAgentUILocale("conversation");
  return (
    <div className="aui-thread-welcome-root mb-6 flex flex-col items-center px-4 text-center">
      <h1 className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-2xl font-medium tracking-tight duration-200">
        {welcome.title ?? messages.welcome}
      </h1>
      {welcome.description === undefined ? null : (
        <p className="text-muted-foreground fade-in slide-in-from-bottom-1 animate-in fill-mode-both mt-2 max-w-xl text-sm leading-6 duration-200">
          {welcome.description}
        </p>
      )}
    </div>
  );
}

export function createConversationSemanticThreadComponents(rendererSlots: { toolTimeline?: boolean; reasoningGroup?: boolean } = {}): ConversationThreadComponents {
  return {
    UserEditComposer: ScopedUserEditComposer,
    Welcome: ConversationEmptyState,
    ReasoningGroup: ScopedReasoningGroup,
    ToolGroup: ScopedToolGroup,
    ...(rendererSlots.toolTimeline ? { ToolTimeline: ScopedToolTimeline } : {}),
    TaskGroup: ScopedTaskGroup,
    ToolFallback: ScopedToolFallback,
    AssistantResponseFooter: ScopedAssistantResponseFooter,
  };
}

export function ConversationAdapter({
  welcome,
  suggestions,
  composer,
  labels,
  renderScopedSlot,
  rendererSlots = {},
}: ConversationEmptyStateProps & {
  rendererSlots?: { toolTimeline?: boolean; reasoningGroup?: boolean };
  labels?: ConversationThreadLabels;
  renderScopedSlot?: UIPluginComponentProps["renderScopedSlot"];
} = {}) {
  const theme = useAgentUITheme();
  const components = useMemo(() => createConversationSemanticThreadComponents(rendererSlots), [rendererSlots.toolTimeline, rendererSlots.reasoningGroup]);
  const emptyState = useMemo(
    () => ({ welcome, suggestions }),
    [welcome, suggestions],
  );
  const surface = (
    <ConversationEmptyStateContext.Provider value={emptyState}>
      <ConversationSurface
        components={components}
        theme={theme}
        composer={composer}
        {...(labels === undefined ? {} : { labels })}
      />
    </ConversationEmptyStateContext.Provider>
  );
  return renderScopedSlot === undefined ? surface : (
    <ScopedRendererBridgeProvider renderScopedSlot={renderScopedSlot}>
      {surface}
    </ScopedRendererBridgeProvider>
  );
}
