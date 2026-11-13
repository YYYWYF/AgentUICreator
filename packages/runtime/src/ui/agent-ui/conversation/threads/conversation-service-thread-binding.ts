import { useLayoutEffect, useRef, useState } from "react";
import {
  createEphemeralConversationThreadBinding,
  type ConversationThreadBinding,
  type ConversationThreadListSnapshot,
} from "../../../../public.js";
import {
  AGENT_UI_THREAD_BINDING_SERVICE,
  type ConversationThreadBindingFactory,
  type ConversationRunResumeProvider,
  type DisposableConversationThreadBinding,
} from "../../../../plugin-api/index.js";
import { usePluginService } from "../../../runtime/plugins/PluginServiceContext.js";
export type { ConversationRunResumeProvider } from "../../../../plugin-api/index.js";
const EMPTY_LIST: ConversationThreadListSnapshot = {
  threads: [],
  archivedThreads: [],
};
export function createConversationThreadBindingHost(initialThreadId?: string) {
  const fallback = createEphemeralConversationThreadBinding(initialThreadId);
  let target: DisposableConversationThreadBinding = fallback;
  let unsubscribe: () => void = () => {};
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());
  const binding: ConversationThreadBinding = {
    getThreadId: () => target.getThreadId(),
    getIsDisabled: () => target.getIsDisabled?.() ?? false,
    getThreadIsDisabled: (id) => target.getThreadIsDisabled?.(id) ?? false,
    loadThread: (id) =>
      target.loadThread?.(id) ?? Promise.resolve({ messages: [] }),
    activateThread: (id) => target.activateThread?.(id),
    reserveThread: (id) => target.reserveThread?.(id),
    initializeThread: (id) =>
      target.initializeThread?.(id) ?? Promise.resolve(id),
    getThreadMetadata: async (id) => {
      if (!target.getThreadMetadata)
        throw new Error(`Conversation "${id}" was not found.`);
      return target.getThreadMetadata(id);
    },
    renameThread: async (id, title) => {
      if (!target.renameThread)
        throw new Error(
          "Conversation persistence does not support renaming threads.",
        );
      return target.renameThread(id, title);
    },
    archiveThread: async (id) => {
      if (!target.archiveThread)
        throw new Error(
          "Conversation persistence does not support archiving threads.",
        );
      return target.archiveThread(id);
    },
    unarchiveThread: async (id) => {
      if (!target.unarchiveThread)
        throw new Error(
          "Conversation persistence does not support unarchiving threads.",
        );
      return target.unarchiveThread(id);
    },
    deleteThread: async (id) => {
      if (!target.deleteThread)
        throw new Error(
          "Conversation persistence does not support deleting threads.",
        );
      return target.deleteThread(id);
    },
    getThreadListSnapshot: () => target.getThreadListSnapshot?.() ?? EMPTY_LIST,
    selectThread: (id) =>
      target.selectThread?.(id) ??
      target.loadThread?.(id) ??
      Promise.resolve({ messages: [] }),
    createNewThread: () => target.createNewThread(),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  unsubscribe = target.subscribe(emit);
  return {
    binding,
    attach(next: DisposableConversationThreadBinding) {
      unsubscribe();
      target.dispose?.();
      target = next;
      unsubscribe = target.subscribe(emit);
      emit();
      return () => {
        if (target !== next) return;
        unsubscribe();
        const id = next.getThreadId();
        next.dispose?.();
        target = createEphemeralConversationThreadBinding(id);
        unsubscribe = target.subscribe(emit);
        emit();
      };
    },
  };
}
export function useConversationServiceThreadBinding<TState = unknown>(
  resumeProvider?: ConversationRunResumeProvider<TState>,
  initialThreadId?: string,
): ConversationThreadBinding<TState> {
  const factory = usePluginService<ConversationThreadBindingFactory>(
    AGENT_UI_THREAD_BINDING_SERVICE,
  );
  const resume = useRef(resumeProvider);
  resume.current = resumeProvider;
  const [host] = useState(() =>
    createConversationThreadBindingHost(initialThreadId),
  );
  useLayoutEffect(() => {
    if (!factory) return;
    return host.attach(
      factory({
        initialThreadId,
        currentThreadId: host.binding.getThreadId(),
        resumeProvider: (snapshot) =>
          resume.current?.(
            snapshot as Parameters<ConversationRunResumeProvider<TState>>[0],
          ),
      }),
    );
  }, [factory, host, initialThreadId]);
  return host.binding as ConversationThreadBinding<TState>;
}
