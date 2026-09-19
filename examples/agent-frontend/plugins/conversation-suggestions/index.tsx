import {
  ConversationSuggestions,
  ConversationSuggestionDescription,
  ConversationSuggestionTitle,
  ConversationSuggestionTrigger,
} from "@agent-ui/react";

import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";

import "./styles.css";

export function ConversationSuggestionsPlugin(
  _props: UIPluginComponentProps,
) {
  return (
    <div
      className="conversation-suggestions-plugin"
      data-ui-plugin="conversation-suggestions"
    >
      <ConversationSuggestions>
        {() => (
          <ConversationSuggestionTrigger
            className="conversation-suggestion"
            send
          >
            <ConversationSuggestionTitle className="conversation-suggestion-title" />
            <ConversationSuggestionDescription className="conversation-suggestion-label" />
          </ConversationSuggestionTrigger>
        )}
      </ConversationSuggestions>
    </div>
  );
}
