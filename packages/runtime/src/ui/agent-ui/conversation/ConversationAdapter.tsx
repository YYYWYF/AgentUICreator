import type {ComponentType} from "react";
import type {ConversationSurfacePresentationProps} from "../../../presentation.js";
import { useAgentUILocale } from "../../../locale.js";
import { ConversationSurface, ConversationWelcome, ConversationEmptyState as EmptyState } from "../../../presentation.js";
import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

import type { ConversationThreadComponents } from "../../../plugin-api/index.js";
import type { UIPluginComponentProps } from "../../../contracts/index.js";
import { useAgentUITheme } from "@za38.03/agent-ui-runtime/ui/agent-ui/theme/useAgentUITheme";
import {
  ScopedUserEditComposer,
  ScopedReasoningGroup,
  ScopedAssistantResponseFooter,
  ScopedRendererBridgeProvider,
  ScopedTaskGroup,
  ScopedToolFallback,
  ScopedToolGroup,
  ScopedToolTimeline,
  ScopedThinkingIndicator,
  ScopedTransientMessages,
} from "./ScopedRendererBridge.js";

export interface ConversationEmptyStateProps {
  welcome?: ReactNode;
  suggestions?: ReactNode;
  composer?: ReactNode;
}

const ConversationEmptyStateContext = createContext<ConversationEmptyStateProps>({});

function ConversationEmptyState() {
  return <EmptyState {...useContext(ConversationEmptyStateContext)} />;
}

export function ConversationWelcomeFallback() {
  const messages = useAgentUILocale("conversation");
  return <ConversationWelcome title={messages.welcome ?? ""} description={messages.welcomeDescription || undefined} />;
}

export function createConversationSemanticThreadComponents(rendererSlots: { toolTimeline?: boolean; reasoningGroup?: boolean; thinkingIndicator?: boolean; transientMessages?: boolean } = {}): ConversationThreadComponents {
  return {
    UserEditComposer: ScopedUserEditComposer,
    Welcome: ConversationEmptyState,
    ...(rendererSlots.transientMessages ? { TransientMessages: ScopedTransientMessages } : {}),
    ReasoningGroup: ScopedReasoningGroup,
    ToolGroup: ScopedToolGroup,
    ...(rendererSlots.thinkingIndicator ? { ThinkingIndicator: ScopedThinkingIndicator, reasoningVisible: rendererSlots.reasoningGroup === true } : {}),
    ...(rendererSlots.toolTimeline ? { ToolTimeline: ScopedToolTimeline } : {}),
    TaskGroup: ScopedTaskGroup,
    ToolFallback: ScopedToolFallback,
    AssistantResponseFooter: ScopedAssistantResponseFooter,
  };
}

export function ConversationAdapter({
  Surface = ConversationSurface, autoFocus, className,
  welcome,
  suggestions,
  composer,
  renderScopedSlot,
  rendererSlots = {},
}: ConversationEmptyStateProps & {
  Surface?: ComponentType<ConversationSurfacePresentationProps>;
  autoFocus?: boolean; className?: string;
  rendererSlots?: { toolTimeline?: boolean; reasoningGroup?: boolean; thinkingIndicator?: boolean; transientMessages?: boolean };
  renderScopedSlot?: UIPluginComponentProps["renderScopedSlot"];
} = {}) {
  const theme = useAgentUITheme();
  const components = useMemo(() => createConversationSemanticThreadComponents(rendererSlots), [rendererSlots.toolTimeline, rendererSlots.reasoningGroup, rendererSlots.thinkingIndicator, rendererSlots.transientMessages]);
  const emptyState = useMemo(
    () => ({ welcome, suggestions }),
    [welcome, suggestions],
  );
  const surface = (
    <ConversationEmptyStateContext.Provider value={emptyState}>
      <Surface
        {...(autoFocus === undefined ? {} : { autoFocus })}
        {...(className === undefined ? {} : { className })}
        components={components}
        theme={theme}
        composer={composer}
      />
    </ConversationEmptyStateContext.Provider>
  );
  return renderScopedSlot === undefined ? surface : (
    <ScopedRendererBridgeProvider renderScopedSlot={renderScopedSlot}>
      {surface}
    </ScopedRendererBridgeProvider>
  );
}
