import { useMemo } from "react";

import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import type { ConversationThreadComponents } from "@agent-ui/react";
import { useConversationPresentationConfig } from "./config";
import { useAgentUIThemeMode } from "../theme/useAgentUITheme";
import { CONVERSATION_SLOTS } from "./slots";
import { ConversationSurface } from "./ConversationSurface";

type RenderSlot = UIPluginComponentProps["renderSlot"];

function ConversationEmptyState({ renderSlot }: { renderSlot: RenderSlot }) {
  const { welcome } = useConversationPresentationConfig();
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
    <div className="conversation-empty-state flex w-full flex-col items-center">
      <div className="conversation-empty-state-welcome w-full">
        {renderSlot(CONVERSATION_SLOTS.welcome, welcomeFallback)}
      </div>
      <div className="conversation-empty-state-suggestions w-full">
        {renderSlot(CONVERSATION_SLOTS.suggestions, null)}
      </div>
    </div>
  );
}

export function createConversationSemanticThreadComponents(
  renderSlot: RenderSlot,
): ConversationThreadComponents {
  return { Welcome: () => <ConversationEmptyState renderSlot={renderSlot} /> };
}

export function ConversationAdapter({
  renderSlot,
}: Pick<UIPluginComponentProps, "renderSlot">) {
  const theme = useAgentUIThemeMode();
  const components = useMemo(
    () => createConversationSemanticThreadComponents(renderSlot),
    [renderSlot],
  );
  return (
    <ConversationSurface
      components={components}
      theme={theme}
    />
  );
}
