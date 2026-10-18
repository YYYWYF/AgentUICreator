import { CanonicalConversationLexicalEditComposer as Implementation } from "@za38.03/agent-ui-plugins/lexical";
import type { ComponentProps } from "react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
export function ConversationLexicalEditComposer(props: ComponentProps<typeof Implementation> & Partial<UIPluginComponentProps>) { return <Implementation {...props} />; }
