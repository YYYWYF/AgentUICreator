"use client";
import type { ComponentProps, ReactNode } from "react";
import { ConversationParts, SuggestionActions } from "../../../../plugin-support.js";
export interface ConversationCanonicalSuggestionsProps {
  rootProps?: ComponentProps<"div">;
  suggestionsProps?: ComponentProps<typeof ConversationParts.Suggestions>;
  triggerProps?: ComponentProps<typeof SuggestionActions.Trigger>;
  titleProps?: ComponentProps<typeof SuggestionActions.Title>;
  descriptionProps?: ComponentProps<typeof SuggestionActions.Description>;
  renderSuggestion?: Extract<ComponentProps<typeof ConversationParts.Suggestions>, {children: unknown}>["children"];
  children?: ReactNode;
}
export function ConversationCanonicalSuggestions({rootProps, suggestionsProps, triggerProps, titleProps, descriptionProps, renderSuggestion, children}: ConversationCanonicalSuggestionsProps) {
  return <div className="conversation-suggestions-plugin" data-ui-plugin="conversation-suggestions" {...rootProps}>
    {children ?? (suggestionsProps ? <ConversationParts.Suggestions {...suggestionsProps}/> : <ConversationParts.Suggestions>{renderSuggestion ?? (()=><SuggestionActions.Trigger data-agent-ui-owned="" className="conversation-suggestion" send {...triggerProps}><SuggestionActions.Title className="conversation-suggestion-title" {...titleProps}/><SuggestionActions.Description className="conversation-suggestion-label" {...descriptionProps}/></SuggestionActions.Trigger>)}</ConversationParts.Suggestions>)}
  </div>;
}
