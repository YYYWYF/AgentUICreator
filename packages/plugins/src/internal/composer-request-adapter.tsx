import { useContext, useLayoutEffect } from 'react';
import { PluginInstanceContext } from '@za38.03/agent-ui-runtime/plugin-api';
import { ConversationComposerDataContext, type ComposerRequestAdapter } from '../composer-support.js';

interface AdapterRegistration {
  registerAdapter(owner: string, adapter: ComposerRequestAdapter): () => void;
}
function isRegistration(value: unknown): value is AdapterRegistration {
  return typeof value === 'object' && value !== null &&
    'registerAdapter' in value && typeof value.registerAdapter === 'function';
}

/** Internal lifecycle of the Composer component's requestAdapter prop. */
export function useComposerRequestAdapter(adapter: ComposerRequestAdapter | undefined): void {
  const scope = useContext(ConversationComposerDataContext);
  const instance = useContext(PluginInstanceContext);
  const owner = instance?.instance.id ?? 'composer';
  const runtime = isRegistration(scope?.runtime) ? scope.runtime : undefined;
  useLayoutEffect(() => adapter && runtime ? runtime.registerAdapter(owner, adapter) : undefined,
    [runtime, owner, adapter]);
}
