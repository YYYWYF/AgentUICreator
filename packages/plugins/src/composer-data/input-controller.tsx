import type { ConversationInputController } from '@za38.03/agent-ui-runtime/plugin-api';
import { ConversationComposerDataContext } from './request.js';
import { ConversationRequestPartsRuntime } from './request-parts.js';
import { readNativeInputSession } from './native-session.js';
import type { ComposerMessageDataAdapter } from '@za38.03/agent-ui-plugins/composer-support';

/** One Composer data owner per Agent; all native Threads share its isolated ports. */
export function createComposerInputController(options: { messageData?: ComposerMessageDataAdapter } = {}): ConversationInputController {
  const parts = new ConversationRequestPartsRuntime(options.messageData);
  return {
    onHistoryLoaded: (_threadId, messages) => parts.onHistoryLoaded(messages),
    Provider: function ComposerInputProvider({ threadId, children }) {
      return <ConversationComposerDataContext.Provider value={{ runtime: parts, threadId }}>
        {children}
      </ConversationComposerDataContext.Provider>;
    },
    attach: (threadId, runtime) => {
      const native = readNativeInputSession(runtime);
      if (!native) throw new Error('AGENT_UI_COMPOSER_RUNTIME_REQUIRED');
      return parts.attach(threadId, native);
    },
    transformRequest: (input, context) => parts.transformRequest(input, context),
  };
}
