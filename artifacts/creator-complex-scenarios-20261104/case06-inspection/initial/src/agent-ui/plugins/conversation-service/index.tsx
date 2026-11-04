import { ConversationServicePlugin as Implementation } from "@za38.03/agent-ui-plugins/conversation-service";
import type { ComponentProps } from "react";
export function ConversationServicePlugin(props: ComponentProps<typeof Implementation>) { return <Implementation {...props} />; }
