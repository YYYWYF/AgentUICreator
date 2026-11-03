import type { ComponentProps } from "react";
import { ConversationCanonicalSuggestions } from "@za38.03/agent-ui-plugins";
import type { UIPluginComponentProps } from "@za38.03/agent-ui-plugins/contracts";
import "./styles.css";
export function ConversationSuggestionsPlugin({renderSlot:_renderSlot, renderScopedSlot:_renderScopedSlot, ...props}: UIPluginComponentProps & ComponentProps<typeof ConversationCanonicalSuggestions>) {return <ConversationCanonicalSuggestions {...props}/>;}
