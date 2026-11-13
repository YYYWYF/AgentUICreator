export {createConversationService,createConversationThreadBindingFactory,AGENT_UI_CONVERSATION_SERVICE,EMPTY_CONVERSATION_SNAPSHOT,type ConversationService,type ConversationSnapshot} from "./adapters/service";
export type {ConversationDataSource} from "./adapters/data-source";
export type {ConversationDetail,ConversationSummary} from "./adapters/contract";
import { parseUIPluginManifest, type UIPluginDefinition } from '../../framework/contracts/ui-plugin';
import { ConversationServicePlugin } from './index';
import manifestJson from './manifest.json';
export function bindSetup<TContext>(
  setup: (context: TContext) => void | (() => void),
): (context: TContext) => void | (() => void) {
  return (context) => setup(context);
}
export const conversationServicePlugin = {
  manifest: parseUIPluginManifest(manifestJson),
  provides: ['agent-ui.conversations','agent-ui.thread-binding'],
  inject: ['agent-ui.conversation-data-source'],
  optionalInject: [],
  bindSetup,
  setup: () => {
    throw new Error('PLUGIN_HOST_BINDINGS_REQUIRED');
  },
  Component: ConversationServicePlugin,
} satisfies UIPluginDefinition & { bindSetup: typeof bindSetup };
export default conversationServicePlugin;

export * from "./adapters/contract";
export * from "./adapters/data-source";

export * from "./adapters/thread-binding";
export * from "./adapters/conversation-history-projector";
