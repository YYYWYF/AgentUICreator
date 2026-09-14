import { useMemo } from "react";

import type { UIPluginComponentProps } from "../../../../framework/contracts/ui-plugin";
import type { ThreadComponents } from "../../../vendor/assistant-ui/components/assistant-ui/elements/thread.aui";
import {
  useAssistantUiPresentationConfig,
} from "../config";
import { useAgentUIThemeMode } from "../../../theme/useAgentUITheme";
import {
  ASSISTANT_UI_CONVERSATION_SLOTS,
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
        {renderSlot(ASSISTANT_UI_CONVERSATION_SLOTS.welcome, welcomeFallback)}
      </div>
      <div className="assistant-ui-empty-state-suggestions w-full">
        {renderSlot(ASSISTANT_UI_CONVERSATION_SLOTS.suggestions, null)}
      </div>
    </div>
  );
}

export function createAssistantUiSemanticThreadComponents(
  renderSlot: RenderSlot,
): ThreadComponents {
  return { Welcome: () => <AssistantUiEmptyState renderSlot={renderSlot} /> };
}

export function AssistantUiConversationAdapter({
  renderSlot,
}: Pick<UIPluginComponentProps, "renderSlot">) {
  const theme = useAgentUIThemeMode();
  const components = useMemo(
    () => createAssistantUiSemanticThreadComponents(renderSlot),
    [renderSlot],
  );
  return (
    <AssistantUiConversationSurface
      components={components}
      theme={theme}
    />
  );
}
