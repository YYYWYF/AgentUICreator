import { useMemo } from "react";
import {
  unstable_useSlashCommandAdapter,
  useAui,
} from "@assistant-ui/react";

import type { AssistantUiComposerQuickPrompt } from "../config";
import { ComposerTriggerPopover } from "../../../vendor/assistant-ui/components/assistant-ui/elements/composer-trigger-popover.aui";

export interface AssistantUiComposerQuickPromptsProps {
  disabled: boolean;
  quickPrompts: readonly AssistantUiComposerQuickPrompt[];
}

export function AssistantUiComposerQuickPrompts({
  disabled,
  quickPrompts,
}: AssistantUiComposerQuickPromptsProps) {
  const aui = useAui();
  const commands = useMemo(
    () => disabled
      ? []
      : quickPrompts.map((prompt) => ({
          id: prompt.id,
          label: prompt.label,
          description: prompt.description,
          execute: () => {
            aui.composer.setText(`${prompt.value} `);
          },
        })),
    [aui, disabled, quickPrompts],
  );
  const slash = unstable_useSlashCommandAdapter({
    commands,
    removeOnExecute: true,
  });

  if (disabled || quickPrompts.length === 0) return null;

  return <ComposerTriggerPopover char="/" {...slash} />;
}
