import type { ComponentProps, ReactNode } from "react";
import { ConversationTaskGroup } from "../../../../public.js";
export type TaskGroupPluginProps=Partial<ComponentProps<typeof ConversationTaskGroup>> & {renderSlot?: (name:string,fallback?:ReactNode)=>ReactNode;renderGroup?:(props:ComponentProps<typeof ConversationTaskGroup>)=>ReactNode};
export function CanonicalTaskGroupPlugin({renderGroup,renderSlot:_,...props}:TaskGroupPluginProps) { return renderGroup ? renderGroup({group:props.group,...props}) : <ConversationTaskGroup group={props.group} {...props}/>; }
