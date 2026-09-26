import type { RemoteThreadListAdapter, RemoteThreadMetadata } from "@assistant-ui/react";
import type { ConversationThreadBinding, ConversationThreadListItem } from "./types.js";

/** Persistence and identity only; assistant-ui owns the runtime cache and lifecycle. */
export function createConversationRemoteThreadListAdapter<TState>(binding: ConversationThreadBinding<TState>) {
  const identities = new Map<string, string>();
  const initialized = new Map<string, RemoteThreadMetadata>();
  const deletedIds = new Set<string>();
  const pendingDeletes = new Map<string, Promise<void>>();
  const initialId = binding.getThreadId();
  const identity = (localId: string, remoteId?: string) => {
    const existing = identities.get(localId);
    if (existing !== undefined) return existing;
    const id = remoteId ?? crypto.randomUUID();
    identities.set(localId, id);
    if (remoteId === undefined) binding.reserveThread?.(id);
    return id;
  };
  const metadata = (item: ConversationThreadListItem<"regular" | "archived">): RemoteThreadMetadata => ({
    remoteId: item.id, status: item.status,
    ...(item.title === undefined ? {} : { title: item.title }),
    ...(item.custom === undefined ? {} : { custom: item.custom }),
  });
  const unsupported = async () => { throw new Error("Conversation persistence does not support this operation."); };
  const adapter: RemoteThreadListAdapter = {
    async list() {
      // Service notifications can trigger reload before delete finishes clearing
      // initialized metadata. Wait so that reload cannot restore the deleted row.
      await Promise.allSettled(pendingDeletes.values());
      const snapshot = binding.getThreadListSnapshot?.();
      const items = [...(snapshot?.threads ?? []), ...(snapshot?.archivedThreads ?? [])].map(metadata).filter(item => !deletedIds.has(item.remoteId));
      const ids = new Set(items.map(item => item.remoteId));
      return { threads: [...items, ...[...initialized.values()].filter(item => !ids.has(item.remoteId) && !deletedIds.has(item.remoteId))] };
    },
    async fetch(id) {
      if (deletedIds.has(id)) throw new Error(`Conversation "${id}" was deleted.`);
      const snapshot = binding.getThreadListSnapshot?.();
      const item = [...(snapshot?.threads ?? []), ...(snapshot?.archivedThreads ?? [])].find(item => item.id === id);
      if (item !== undefined) {
        const found = metadata(item);
        initialized.set(id, found);
        return found;
      }
      const cached = initialized.get(id);
      if (cached !== undefined) return cached;
      if (id === initialId) {
        const initial: RemoteThreadMetadata = { remoteId: id, status: "regular" };
        initialized.set(id, initial);
        return initial;
      }
      if (binding.getThreadMetadata !== undefined) {
        const found = metadata(await binding.getThreadMetadata(id));
        // A metadata read may have begun before persistence deletion completed.
        if (deletedIds.has(id)) throw new Error(`Conversation "${id}" was deleted.`);
        initialized.set(id, found);
        return found;
      }
      throw new Error(`Conversation "${id}" was not found.`);
    },
    async initialize(localId) {
      const reserved = identity(localId);
      const remoteId = await binding.initializeThread?.(reserved) ?? reserved;
      // An Agent has already been constructed with this reserved backend identity.
      if (remoteId !== reserved) throw new Error("Conversation initialization changed the reserved Agent identity.");
      initialized.set(remoteId, { remoteId, status: "regular" });
      return { remoteId };
    },
    rename: unsupported, archive: unsupported, unarchive: unsupported,
    async delete(remoteId) {
      if (binding.deleteThread === undefined) {
        throw new Error("Conversation persistence does not support deleting threads.");
      }
      const existing = pendingDeletes.get(remoteId);
      if (existing !== undefined) return existing;
      const deleteThread = binding.deleteThread.bind(binding);
      const deletion = Promise.resolve().then(async () => {
        await deleteThread(remoteId);
        deletedIds.add(remoteId);
        initialized.delete(remoteId);
        for (const [localId, id] of identities) {
          if (id === remoteId) identities.delete(localId);
        }
      });
      pendingDeletes.set(remoteId, deletion);
      try {
        await deletion;
      } finally {
        pendingDeletes.delete(remoteId);
      }
    },
    async generateTitle() {
      // Existing backends own titles. Do not invent a second title workflow.
      return new ReadableStream({ start(controller) { controller.close(); } });
    },
  };
  return { adapter, identity, initialId };
}
