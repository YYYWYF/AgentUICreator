import { CanonicalConversationServicePlugin as Implementation } from "@za38.03/agent-ui-plugins";
import type { ComponentProps } from "react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
export function ConversationServicePlugin(props: ComponentProps<typeof Implementation> & Partial<UIPluginComponentProps>) { return <Implementation {...props} />; }
