import { useAgentUILocale, ConversationSurface, ConversationWelcome, ConversationEmptyState as EmptyState } from "@za38.03/agent-ui-plugins";
import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

import type { ConversationThreadComponents, ConversationThreadLabels } from "@za38.03/agent-ui-plugins";
import type { UIPluginComponentProps } from "@za38.03/agent-ui-plugins/contracts";
import { useConversationPresentationConfig } from "../../presentation-config.js";
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
  const { welcome } = useConversationPresentationConfig();
  const messages = useAgentUILocale("conversation");
  return <ConversationWelcome title={welcome.title ?? messages.welcome} description={welcome.description} />;
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
  autoFocus, className,
  welcome,
  suggestions,
  composer,
  labels,
  renderScopedSlot,
  rendererSlots = {},
}: ConversationEmptyStateProps & {
  autoFocus?: boolean; className?: string;
  rendererSlots?: { toolTimeline?: boolean; reasoningGroup?: boolean; thinkingIndicator?: boolean; transientMessages?: boolean };
  labels?: ConversationThreadLabels;
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
      <ConversationSurface
        {...(autoFocus === undefined ? {} : { autoFocus })}
        {...(className === undefined ? {} : { className })}
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
