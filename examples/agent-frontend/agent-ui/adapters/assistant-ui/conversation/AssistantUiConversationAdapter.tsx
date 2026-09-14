import { useMemo } from "react";

import type { UIPluginComponentProps } from "../../../../framework/contracts/ui-plugin";
import type { ThreadComponents } from "../../../vendor/assistant-ui/components/assistant-ui/elements/thread.aui";
import {
  useAssistantUiPresentationConfig,
  type AssistantUiPresentationConfig,
} from "../config";
import { useAgentUIThemeMode } from "../../../theme/useAgentUITheme";
import {
  ASSISTANT_UI_CONVERSATION_SLOTS,
  SemanticReasoningOutlet,
  SemanticSlotFallbackProvider,
  SemanticToolActivityOutlet,
  SemanticToolItemOutlet,
} from "../slots";
import { AssistantUiConversationSurface } from "./AssistantUiConversationSurface";

type RenderSlot = UIPluginComponentProps["renderSlot"];

function AssistantUiEmptyState({ renderSlot }: { renderSlot: RenderSlot }) {
  const { welcome } = useAssistantUiPresentationConfig();
  const welcomeFallback = (
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

  return (
    <div className="assistant-ui-empty-state flex w-full flex-col items-center">
      <div className="assistant-ui-empty-state-welcome w-full">
        <SemanticSlotFallbackProvider
          fallback={welcomeFallback}
          slotId={ASSISTANT_UI_CONVERSATION_SLOTS.welcome}
        >
          {renderSlot(
            ASSISTANT_UI_CONVERSATION_SLOTS.welcome,
            welcomeFallback,
          )}
        </SemanticSlotFallbackProvider>
      </div>
      <div className="assistant-ui-empty-state-suggestions w-full">
        {renderSlot(ASSISTANT_UI_CONVERSATION_SLOTS.suggestions, null)}
      </div>
    </div>
  );
}

export function createAssistantUiSemanticThreadComponents(
  renderSlot: RenderSlot,
  _presentation?: AssistantUiPresentationConfig,
): ThreadComponents {
  const components: ThreadComponents = {
    ReasoningGroup: SemanticReasoningOutlet,
    ToolGroup: SemanticToolActivityOutlet,
    ToolFallback: SemanticToolItemOutlet,
  };

  components.Welcome = () => <AssistantUiEmptyState renderSlot={renderSlot} />;

  return components;
}

export function AssistantUiConversationAdapter({
  renderSlot,
}: Pick<UIPluginComponentProps, "renderSlot">) {
  const theme = useAgentUIThemeMode();
  const presentation = useAssistantUiPresentationConfig();
  const components = useMemo(
    () => createAssistantUiSemanticThreadComponents(renderSlot, presentation),
    [presentation, renderSlot],
  );
  return (
    <AssistantUiConversationSurface
      components={components}
      theme={theme}
    />
  );
}
