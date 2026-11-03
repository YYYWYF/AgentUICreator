import { useConversations } from "../../hooks/useConversations";
import { ConversationSurfacePlugin as Implementation } from "@za38.03/agent-ui-plugins/conversation-surface";
import type { ComponentProps } from "react";
import {ConversationAdapter,ConversationWelcomeFallback} from "../../agent-ui/conversation";
import {useConversationRendererSlots} from "../../agent-ui/conversation/useConversationRendererSlots";

export function ConversationSurfacePlugin(props: ComponentProps<typeof Implementation>) {
  const rendererSlots=useConversationRendererSlots();
  const { snapshot } = useConversations();
  return <Implementation Adapter={ConversationAdapter} rendererSlots={rendererSlots} snapshot={snapshot} welcome={<ConversationWelcomeFallback/>} {...props} />;
}
