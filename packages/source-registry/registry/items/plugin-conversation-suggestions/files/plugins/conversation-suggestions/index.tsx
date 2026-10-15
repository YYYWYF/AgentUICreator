import {
  ConversationSuggestions,
  ConversationSuggestionDescription,
  ConversationSuggestionTitle,
  ConversationSuggestionTrigger,
} from "@za38.03/agent-ui-plugins";

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
            data-agent-ui-owned=""
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
