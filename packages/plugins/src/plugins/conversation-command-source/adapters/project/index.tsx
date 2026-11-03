import { CanonicalConversationCommandSourcePlugin as Implementation } from "@za38.03/agent-ui-plugins";
import type { ComponentProps } from "react";
import type { UIPluginComponentProps } from "@za38.03/agent-ui-plugins/contracts";
export function ConversationCommandSourcePlugin(props: ComponentProps<typeof Implementation> & Partial<UIPluginComponentProps>) { return <Implementation {...props} />; }
