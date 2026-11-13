import { CanonicalConversationServicePlugin, type ConversationServicePluginProps } from '@za38.03/agent-ui-plugins';
export function ConversationServicePlugin(props: ConversationServicePluginProps) {
  return <CanonicalConversationServicePlugin {...props} />;
}

export {createConversationService,createConversationThreadBindingFactory,AGENT_UI_CONVERSATION_SERVICE,EMPTY_CONVERSATION_SNAPSHOT,type ConversationService,type ConversationSnapshot} from "./adapters/service";
export type {ConversationDataSource} from "./adapters/data-source";
export type {ConversationDetail,ConversationSummary} from "./adapters/contract";

export * from "./adapters/contract";
export * from "./adapters/data-source";

export * from "./adapters/thread-binding";
export * from "./adapters/conversation-history-projector";
