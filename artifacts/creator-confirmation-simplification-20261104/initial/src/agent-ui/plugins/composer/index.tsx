import { useAgentUILocaleCode, useConversationComposer } from "@za38.03/agent-ui-plugins";
import { ConversationComposerPlugin as Composer } from "@za38.03/agent-ui-plugins/composer";
import type { ComponentProps } from "react";

const MAX_COMPOSER_LENGTH = 200;

/** Project-owned counter messages keyed by the unified Agent UI locale code. */
const composerCounterMessages = {
  "zh-CN": { limitReached: "已达到字数上限" },
  "en-US": { limitReached: "Character limit reached" },
} as const;

export function ConversationComposerPlugin(props: ComponentProps<typeof Composer>) {
  const { inputProps, ...rest } = props;
  const { text } = useConversationComposer();
  const localeCode = useAgentUILocaleCode();
  const usedLength = text.length;
  const atLimit = usedLength >= MAX_COMPOSER_LENGTH;
  const messages = composerCounterMessages[localeCode];

  return (
    <div className="aui-composer-counter-root">
      <Composer {...rest} inputProps={{ ...inputProps, maxLength: MAX_COMPOSER_LENGTH }} />
      <div className="aui-composer-counter" data-at-limit={atLimit}>
        <span className="aui-composer-counter-value">
          {usedLength}/{MAX_COMPOSER_LENGTH}
        </span>
        {atLimit ? (
          <span className="aui-composer-counter-limit" role="status">
            {messages.limitReached}
          </span>
        ) : null}
      </div>
    </div>
  );
}
