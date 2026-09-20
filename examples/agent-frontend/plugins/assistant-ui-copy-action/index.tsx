import {
  ConversationActionCopy,
  ConversationIf,
  ConversationTooltipIconButton,
} from "@agent-ui/react";
import { CheckIcon, CopyIcon } from "lucide-react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { useAgentUILocale } from "../../agent-ui/i18n/useAgentUILocale";

export function AssistantUiCopyActionPlugin(_props: UIPluginComponentProps) {
  const locale = useAgentUILocale("messageActions");

  return (
    <ConversationActionCopy>
      <ConversationTooltipIconButton tooltip={locale.copy} type="button">
        <ConversationIf condition={(state) => state.message.isCopied}>
          <CheckIcon
            aria-label={locale.copied}
            className="animate-in zoom-in-50 fade-in duration-200 ease-out"
          />
        </ConversationIf>
        <ConversationIf condition={(state) => !state.message.isCopied}>
          <CopyIcon className="animate-in zoom-in-75 fade-in duration-150" />
        </ConversationIf>
      </ConversationTooltipIconButton>
    </ConversationActionCopy>
  );
}
