import type { AssistantRuntime, ThreadMessage } from '@assistant-ui/react';

export function readNativeInputSession(value: unknown): AssistantRuntime | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null ||
      !('thread' in value) || typeof value.thread !== 'object' || value.thread === null ||
      !('composer' in value.thread) || !('getState' in value.thread) ||
      typeof value.thread.getState !== 'function' ||
      !('registerModelContextProvider' in value) || typeof value.registerModelContextProvider !== 'function') {
    throw new Error('AGENT_UI_COMPOSER_RUNTIME_REQUIRED');
  }
  return value as AssistantRuntime;
}

export function isSubmittedUserMessage(value: unknown): value is ThreadMessage & { role: 'user' } {
  return typeof value === 'object' && value !== null &&
    'role' in value && value.role === 'user' && 'id' in value && typeof value.id === 'string' &&
    'content' in value && Array.isArray(value.content) &&
    'metadata' in value && typeof value.metadata === 'object' && value.metadata !== null &&
    'custom' in value.metadata && typeof value.metadata.custom === 'object' && value.metadata.custom !== null;
}
