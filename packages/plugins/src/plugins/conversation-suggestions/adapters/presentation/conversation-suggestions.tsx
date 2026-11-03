"use client";
import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { ConversationSuggestion } from "../../../../public.js";
import { ConversationParts, SuggestionActions } from "../../../../plugin-support.js";
export interface ConversationSuggestionItem { title?: string; label?: string; prompt: string }
export interface ConversationCanonicalSuggestionsProps extends Omit<ComponentProps<"div">, "children"> {
  items?: readonly ConversationSuggestionItem[];
  sendOnSelect?: boolean;
  clearComposer?: boolean;
  buttonProps?: Omit<ComponentProps<typeof SuggestionActions.Trigger>, "send" | "clearComposer">;
  classNames?: Partial<Record<"title" | "description", string>>;
  styles?: Partial<Record<"title" | "description", CSSProperties>>;
  renderSuggestion?: Extract<ComponentProps<typeof ConversationParts.Suggestions>, { children: unknown }>["children"];
  children?: ReactNode;
}
export function ConversationCanonicalSuggestions({ items, sendOnSelect = true, clearComposer, buttonProps, classNames, styles, renderSuggestion, children, ...elementProps }: ConversationCanonicalSuggestionsProps) {
  const behavior = { send: sendOnSelect, ...(clearComposer === undefined ? {} : { clearComposer }) };
  const titleProps = { className: ["conversation-suggestion-title", classNames?.title].filter(Boolean).join(" "), style: styles?.title };
  const descriptionProps = { className: ["conversation-suggestion-label", classNames?.description].filter(Boolean).join(" "), style: styles?.description };
  return <div {...elementProps} className={["conversation-suggestions-plugin", elementProps.className].filter(Boolean).join(" ")} data-ui-plugin="conversation-suggestions">
    {children ?? (items !== undefined ? items.map((item, index) => <ConversationSuggestion key={`${index}:${item.prompt}`} prompt={item.prompt} {...behavior} data-agent-ui-owned="" className="conversation-suggestion" {...buttonProps}>
      <span {...titleProps}>{item.title ?? item.prompt}</span>
      {item.label === undefined ? null : <span {...descriptionProps}>{item.label}</span>}
    </ConversationSuggestion>) : <ConversationParts.Suggestions>{renderSuggestion ?? (() => <SuggestionActions.Trigger data-agent-ui-owned="" className="conversation-suggestion" {...behavior} {...buttonProps}>
      <SuggestionActions.Title {...titleProps} /><SuggestionActions.Description {...descriptionProps} />
    </SuggestionActions.Trigger>)}</ConversationParts.Suggestions>)}
  </div>;
}
