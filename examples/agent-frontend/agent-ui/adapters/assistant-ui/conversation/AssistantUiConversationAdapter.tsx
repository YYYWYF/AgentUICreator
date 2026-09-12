import { useMemo, type PropsWithChildren } from "react";

import type { UIPluginComponentProps } from "../../../../framework/contracts/ui-plugin";
import type { ThreadComponents } from "../../../vendor/assistant-ui/components/assistant-ui/elements/thread.aui";
import {
  ASSISTANT_UI_CONVERSATION_SLOTS,
  SemanticAttachmentsOutlet,
  SemanticReasoningOutlet,
  SemanticSlotFallbackProvider,
  SemanticSourcesOutlet,
  SemanticToolActivityOutlet,
  SemanticToolItemOutlet,
  type AssistantUiConversationSlotId,
} from "../slots";
import { AssistantUiConversationSurface } from "./AssistantUiConversationSurface";

type RenderSlot = UIPluginComponentProps["renderSlot"];

function createTopLevelWrapper(
  renderSlot: RenderSlot,
  slotId: AssistantUiConversationSlotId,
) {
  return function SemanticTopLevelOutlet({ children }: PropsWithChildren) {
    return (
      <SemanticSlotFallbackProvider fallback={children} slotId={slotId}>
        {renderSlot(slotId, children)}
      </SemanticSlotFallbackProvider>
    );
  };
}

function createComposerWrapper(renderSlot: RenderSlot) {
  return function SemanticComposerOutlet({
    autoFocus: _autoFocus,
    children,
  }: PropsWithChildren<{ autoFocus: boolean }>) {
    return (
      <SemanticSlotFallbackProvider
        fallback={children}
        slotId={ASSISTANT_UI_CONVERSATION_SLOTS.composer}
      >
        {renderSlot(ASSISTANT_UI_CONVERSATION_SLOTS.composer, children)}
      </SemanticSlotFallbackProvider>
    );
  };
}

export function createAssistantUiSemanticThreadComponents(
  renderSlot: RenderSlot,
): ThreadComponents {
  return {
    WelcomeWrapper: createTopLevelWrapper(
      renderSlot,
      ASSISTANT_UI_CONVERSATION_SLOTS.welcome,
    ),
    TimelineWrapper: createTopLevelWrapper(
      renderSlot,
      ASSISTANT_UI_CONVERSATION_SLOTS.timeline,
    ),
    InitialSuggestionsWrapper: createTopLevelWrapper(
      renderSlot,
      ASSISTANT_UI_CONVERSATION_SLOTS.suggestions,
    ),
    ComposerWrapper: createComposerWrapper(renderSlot),
    ReasoningGroup: SemanticReasoningOutlet,
    ToolGroup: SemanticToolActivityOutlet,
    ToolFallback: SemanticToolItemOutlet,
    UserAttachmentsWrapper: SemanticAttachmentsOutlet,
    MessageFooter: SemanticSourcesOutlet,
  };
}

export function AssistantUiConversationAdapter({
  renderSlot,
}: Pick<UIPluginComponentProps, "renderSlot">) {
  const components = useMemo(
    () => createAssistantUiSemanticThreadComponents(renderSlot),
    [renderSlot],
  );
  return <AssistantUiConversationSurface components={components} />;
}
