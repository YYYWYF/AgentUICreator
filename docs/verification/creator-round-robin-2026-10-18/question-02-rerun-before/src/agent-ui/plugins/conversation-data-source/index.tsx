import { ConversationDataSourcePlugin as Implementation } from "@za38.03/agent-ui-plugins/conversation-data-source";
import type { ComponentProps } from "react";
export function ConversationDataSourcePlugin(props: ComponentProps<typeof Implementation>) { return <Implementation {...props} />; }
