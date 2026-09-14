import { ConversationSuggestion } from "@agent-ui/react";

import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { usePluginInstance } from "../../runtime/context";

import "./styles.css";

export interface ConversationSuggestionItem {
  prompt: string;
  title?: string;
  label?: string;
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

export function readSuggestionItems(value: unknown): ConversationSuggestionItem[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return [];
    }

    const record = item as Record<string, unknown>;
    const prompt = readNonEmptyString(record.prompt);
    if (prompt === undefined) return [];

    const title = readNonEmptyString(record.title);
    const label = readNonEmptyString(record.label);
    return [{
      prompt,
      ...(title === undefined ? {} : { title }),
      ...(label === undefined ? {} : { label }),
    }];
  });
}

export function ConversationSuggestionsPlugin(
  _props: UIPluginComponentProps,
) {
  const instance = usePluginInstance();
  const items = readSuggestionItems(instance.props?.items);

  if (items.length === 0) {
    return null;
  }

  return (
    <div
      className="conversation-suggestions-plugin"
      data-ui-plugin="conversation-suggestions"
    >
      {items.map((item, index) => (
        <ConversationSuggestion
          key={`${item.prompt}-${index}`}
          className="conversation-suggestion"
          prompt={item.prompt}
          send
        >
          <span className="conversation-suggestion-title">
            {item.title ?? item.prompt}
          </span>
          {item.label === undefined ? null : (
            <span className="conversation-suggestion-label">
              {item.label}
            </span>
          )}
        </ConversationSuggestion>
      ))}
    </div>
  );
}
