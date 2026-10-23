import { ConversationCommandSourcePlugin as Implementation } from "@za38.03/agent-ui-plugins/conversation-command-source";
import type { ComponentProps } from "react";
export function ConversationCommandSourcePlugin(props: ComponentProps<typeof Implementation>) { return <Implementation {...props} />; }
