import { ConversationSurfacePlugin as Implementation } from "@za38.03/agent-ui-plugins/conversation-surface";
import type { ComponentProps } from "react";
import {ConversationAdapter,ConversationWelcomeFallback} from "../../agent-ui/conversation";
import {useConversationRendererSlots} from "../../agent-ui/conversation/useConversationRendererSlots";
import {usePluginService,usePluginServiceSnapshot} from "../../runtime/plugins";
import {AGENT_UI_CONVERSATION_SERVICE,EMPTY_CONVERSATION_SNAPSHOT,type ConversationService} from "../../services/conversations";

export function ConversationSurfacePlugin(props: ComponentProps<typeof Implementation>) {
  const rendererSlots=useConversationRendererSlots();
  const service=usePluginService<ConversationService>(AGENT_UI_CONVERSATION_SERVICE);
  const snapshot=usePluginServiceSnapshot(service,EMPTY_CONVERSATION_SNAPSHOT);
  return <Implementation Adapter={ConversationAdapter} rendererSlots={rendererSlots} snapshot={snapshot} welcomeFallback={<ConversationWelcomeFallback/>} {...props} />;
}
