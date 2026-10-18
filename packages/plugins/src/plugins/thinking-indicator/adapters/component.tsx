import type { ComponentProps } from "react";
import { ConversationThinkingIndicator } from "@za38.03/agent-ui-plugins";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
export function ConversationThinkingIndicatorPlugin({renderSlot:_renderSlot, renderScopedSlot:_renderScopedSlot, reasoningVisible = false, timelineVisible = false, ...props}: UIPluginComponentProps & Partial<ComponentProps<typeof ConversationThinkingIndicator>>) {return <ConversationThinkingIndicator reasoningVisible={reasoningVisible} timelineVisible={timelineVisible} {...props}/>;}
