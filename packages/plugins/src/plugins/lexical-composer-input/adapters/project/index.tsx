import { CanonicalConversationLexicalComposerInput as Implementation } from "@za38.03/agent-ui-plugins/lexical";
import type { ComponentProps } from "react";
import type { UIPluginComponentProps } from "@za38.03/agent-ui-plugins/contracts";
export function ConversationLexicalComposerInput(props: ComponentProps<typeof Implementation> & Partial<UIPluginComponentProps>) { return <Implementation {...props} />; }
