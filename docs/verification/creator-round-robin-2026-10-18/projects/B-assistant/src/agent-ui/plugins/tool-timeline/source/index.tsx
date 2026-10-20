import type { ComponentProps } from "react";
import { ConversationToolTimeline } from "./adapters/tool-timeline";
import type { UIPluginComponentProps } from "../../../framework/contracts/ui-plugin";
export function ConversationToolTimelinePlugin({renderSlot:_renderSlot, renderScopedSlot:_renderScopedSlot, ...props}: UIPluginComponentProps & Partial<ComponentProps<typeof ConversationToolTimeline>>) {return <ConversationToolTimeline {...props}/>;}
