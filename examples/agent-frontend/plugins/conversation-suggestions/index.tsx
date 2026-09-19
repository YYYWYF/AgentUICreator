import {
  ConversationSuggestion,
  ConversationSuggestions,
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
        {(suggestion) => (
          <ConversationSuggestion
            className="conversation-suggestion"
            prompt={suggestion.prompt}
            send
          >
            <span className="conversation-suggestion-title">
              {suggestion.title}
            </span>
            {suggestion.label.length === 0 ? null : (
              <span className="conversation-suggestion-label">
                {suggestion.label}
              </span>
            )}
          </ConversationSuggestion>
        )}
      </ConversationSuggestions>
    </div>
  );
}
