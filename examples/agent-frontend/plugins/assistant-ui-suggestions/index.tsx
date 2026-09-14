import { ThreadPrimitive } from "@assistant-ui/react";

import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { usePluginInstance } from "../../runtime/context";

import "./styles.css";

export interface AssistantUiSuggestionItem {
  prompt: string;
  title?: string;
  label?: string;
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

export function readSuggestionItems(value: unknown): AssistantUiSuggestionItem[] {
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

export function AssistantUiSuggestionsPlugin(
  _props: UIPluginComponentProps,
) {
  const instance = usePluginInstance();
  const items = readSuggestionItems(instance.props?.items);

  if (items.length === 0) {
    return null;
  }

  return (
    <div
      className="assistant-ui-suggestions-plugin"
      data-ui-plugin="assistant-ui-suggestions"
    >
      {items.map((item, index) => (
        <ThreadPrimitive.Suggestion
          key={`${item.prompt}-${index}`}
          className="assistant-ui-suggestion"
          prompt={item.prompt}
          send
        >
          <span className="assistant-ui-suggestion-title">
            {item.title ?? item.prompt}
          </span>
          {item.label === undefined ? null : (
            <span className="assistant-ui-suggestion-label">
              {item.label}
            </span>
          )}
        </ThreadPrimitive.Suggestion>
      ))}
    </div>
  );
}
