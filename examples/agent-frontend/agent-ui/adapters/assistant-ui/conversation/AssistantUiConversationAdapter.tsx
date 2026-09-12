import { useMemo, type PropsWithChildren } from "react";

import type { UIPluginComponentProps } from "../../../../framework/contracts/ui-plugin";
import {
  usePluginService,
  usePluginServiceSnapshot,
} from "../../../../runtime/plugins";
import {
  AGENT_UI_CONVERSATION_SERVICE,
  EMPTY_CONVERSATION_SNAPSHOT,
  type AgentUIConversationService,
} from "../../../../services/conversations";
import type { ThreadComponents } from "../../../vendor/assistant-ui/components/assistant-ui/elements/thread.aui";
import { AssistantUiComposerQuickPrompts } from "../composer";
import { useAssistantUiPresentationConfig } from "../config";
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
  const presentationConfig = useAssistantUiPresentationConfig();
  const conversation = usePluginService<AgentUIConversationService>(
    AGENT_UI_CONVERSATION_SERVICE,
  );
  const conversationSnapshot = usePluginServiceSnapshot(
    conversation,
    EMPTY_CONVERSATION_SNAPSHOT,
  );
  const historyMode = conversationSnapshot.mode === "history";
  const components = useMemo(() => {
    const threadComponents =
      createAssistantUiSemanticThreadComponents(renderSlot);
    const quickPrompts = presentationConfig.composer.quickPrompts;
    if (quickPrompts.length === 0) return threadComponents;

    return {
      ...threadComponents,
      ComposerAddon: ({ disabled }: { disabled: boolean }) => (
        <AssistantUiComposerQuickPrompts
          disabled={disabled}
          quickPrompts={quickPrompts}
        />
      ),
    };
  }, [presentationConfig.composer.quickPrompts, renderSlot]);
  const presentation = useMemo(
    () => {
      const placeholder = historyMode
        ? "历史会话为只读，请返回当前会话或新建会话"
        : presentationConfig.composer.placeholder;
      return {
        welcome: presentationConfig.welcome,
        composer: {
          ...(placeholder === undefined ? {} : { placeholder }),
          disabled: historyMode,
        },
      };
    },
    [
      historyMode,
      presentationConfig.composer.placeholder,
      presentationConfig.welcome,
    ],
  );
  return (
    <AssistantUiConversationSurface
      components={components}
      presentation={presentation}
    />
  );
}
