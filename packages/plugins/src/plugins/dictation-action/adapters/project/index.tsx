import type { ComponentProps, ReactNode } from "react";
import { ConversationComposerDictate, ConversationComposerStopDictation } from "@za38.03/agent-ui-plugins";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
export function ConversationDictationActionPlugin({dictateProps, stopProps, children}: UIPluginComponentProps & {dictateProps?: ComponentProps<typeof ConversationComposerDictate>; stopProps?: ComponentProps<typeof ConversationComposerStopDictation>; children?: ReactNode}) { return <>{children ?? <><ConversationComposerDictate {...dictateProps}/><ConversationComposerStopDictation {...stopProps}/></>}</>; }
