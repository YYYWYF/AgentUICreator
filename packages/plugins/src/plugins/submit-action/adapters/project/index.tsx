import type { ComponentProps, ReactNode } from "react";
import { ConversationComposerSend, ConversationComposerCancel } from "@za38.03/agent-ui-plugins";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
export function ConversationSubmitActionPlugin({sendProps, cancelProps, children}: UIPluginComponentProps & {sendProps?: ComponentProps<typeof ConversationComposerSend>; cancelProps?: ComponentProps<typeof ConversationComposerCancel>; children?: ReactNode}) { return <>{children ?? <><ConversationComposerSend {...sendProps}/><ConversationComposerCancel {...cancelProps}/></>}</>; }
