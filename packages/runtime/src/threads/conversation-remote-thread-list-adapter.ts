import type { RemoteThreadListAdapter } from "@assistant-ui/react";
import type { ConversationThreadBinding, ConversationThreadListItem } from "./types.js";

type RemoteThreadMetadata = Awaited<ReturnType<RemoteThreadListAdapter["fetch"]>>;
type TitleStreamChunk = Awaited<ReturnType<RemoteThreadListAdapter["generateTitle"]>> extends ReadableStream<infer Chunk> ? Chunk : never;

/** Persistence and identity only; assistant-ui owns the runtime cache and lifecycle. */
export function createConversationRemoteThreadListAdapter<TState>(binding: ConversationThreadBinding<TState>, deferIdentity: () => boolean = () => false) {
  const identities = new Map<string, string>();
  // assistant-ui retains its local routing identity while the first request
  // assigns the backend identity. All persistence calls translate at this seam.
  const canonicalIds = new Map<string, string>();
  const routingIds = new Map<string, string>();
  const unbound = new Set<string>();
  const listeners = new Set<() => void>();
  const canonicalId = (id: string) => canonicalIds.get(id) ?? id;
  const routingId = (id: string) => routingIds.get(id) ?? id;
  const initialized = new Map<string, RemoteThreadMetadata>();
  const persistedIds = new Set<string>();
  const deletedIds = new Set<string>();
  const pendingDeletes = new Map<string, Promise<void>>();
  const pendingChanges = new Set<Promise<void>>();
  const initialId = binding.getThreadId();
  const identity = (localId: string, remoteId?: string) => {
    const existing = identities.get(localId);
    if (existing !== undefined) return existing;
    const known = remoteId === undefined ? undefined : canonicalIds.get(remoteId);
    const pending = known === undefined && deferIdentity() && (remoteId === undefined || binding.getThreadIsNew?.(remoteId) === true);
    const id = known ?? remoteId ?? (pending ? localId : crypto.randomUUID());
    identities.set(localId, id);
    if (pending) unbound.add(id);
    else if (!unbound.has(id)) canonicalIds.set(id, id);
    if (remoteId === undefined) binding.reserveThread?.(id);
    return id;
  };
  const requestThreadId = (localId: string) => {
    const id = identity(localId);
    return unbound.has(id) ? undefined : id;
  };
  const bindThreadId = (localId: string, id: string) => {
    const previous = identity(localId);
    if (!unbound.has(previous)) {
      if (id !== previous) throw new Error("AGENT_UI_THREAD_ID_ALREADY_BOUND");
      return;
    }
    const occupied = new Set(identities.values());
    if (id !== previous && occupied.has(canonicalId(id))) {
      throw new Error("AGENT_UI_DUPLICATE_THREAD_ID");
    }
    const route = routingId(previous);
    canonicalIds.set(route, id);
    canonicalIds.set(id, id);
    routingIds.delete(previous);
    routingIds.set(id, route);
    unbound.delete(previous);
    for (const [key, value] of identities) if (value === previous) identities.set(key, id);
    binding.reserveThread?.(id);
    if (binding.getThreadId() === previous) binding.activateThread?.(id);
    for (const listener of listeners) listener();
  };
  const metadata = (item: ConversationThreadListItem<"regular" | "archived">): RemoteThreadMetadata => {
    const route = routingId(item.id);
    persistedIds.add(route);
    const title = item.title?.trim() ? item.title : initialized.get(route)?.title;
    return {
      remoteId: route, status: item.status,
      ...(title === undefined ? {} : { title }),
      ...(item.lastMessageAt === undefined ? {} : { lastMessageAt: item.lastMessageAt }),
      ...(item.custom === undefined ? {} : { custom: item.custom }),
    };
  };
  const change = async (remoteId: string, persist: () => Promise<void>, patch: Partial<RemoteThreadMetadata>) => {
    if (deletedIds.has(remoteId)) throw new Error(`Conversation "${remoteId}" was deleted.`);
    const operation = Promise.resolve().then(async () => {
      await persist();
      const cached = initialized.get(remoteId);
      if (cached !== undefined && !deletedIds.has(remoteId)) initialized.set(remoteId, { ...cached, ...patch });
    });
    pendingChanges.add(operation);
    try { await operation; } finally { pendingChanges.delete(operation); }
  };
  const adapter: RemoteThreadListAdapter = {
    async list() {
      // Service notifications can trigger reload before delete finishes clearing
      // initialized metadata. Wait so that reload cannot restore the deleted row.
      await Promise.allSettled([...pendingDeletes.values(), ...pendingChanges]);
      const snapshot = binding.getThreadListSnapshot?.();
      const items = [...(snapshot?.threads ?? []), ...(snapshot?.archivedThreads ?? [])].map(metadata).filter(item => !deletedIds.has(item.remoteId));
      const ids = new Set(items.map(item => item.remoteId));
      // A complete refreshed list may omit a record deleted by another client.
      // Keep optimistic local threads, but never reinsert known persisted rows
      // solely because a mounted thread previously cached their metadata.
      if (snapshot !== undefined && !snapshot.isLoading) {
        for (const id of persistedIds) if (!ids.has(id)) initialized.delete(id);
      }
      return { threads: [...items, ...[...initialized.values()].filter(item => !ids.has(item.remoteId) && !deletedIds.has(item.remoteId))] };
    },
    async fetch(id) {
      if (deletedIds.has(id)) throw new Error(`Conversation "${id}" was deleted.`);
      const snapshot = binding.getThreadListSnapshot?.();
      const item = [...(snapshot?.threads ?? []), ...(snapshot?.archivedThreads ?? [])].find(item => item.id === canonicalId(id));
      if (item !== undefined) {
        const found = metadata(item);
        initialized.set(id, found);
        return found;
      }
      const cached = initialized.get(id);
      if (cached !== undefined) return cached;
      if (id === initialId && !persistedIds.has(id)) {
        const initial: RemoteThreadMetadata = { remoteId: id, status: "regular" };
        initialized.set(id, initial);
        return initial;
      }
      if (binding.getThreadMetadata !== undefined) {
        const found = metadata(await binding.getThreadMetadata(canonicalId(id)));
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
      // Persistence initialization preserves its reservation; the request hook
      // adopts a business identity through bindThreadId instead.
      if (remoteId !== reserved) throw new Error("Conversation initialization changed the reserved Agent identity.");
      const route = routingId(remoteId);
      initialized.set(route, { remoteId: route, status: "regular" });
      return { remoteId: route };
    },
    async rename(remoteId, title) {
      if (binding.renameThread === undefined) throw new Error("Conversation persistence does not support renaming threads.");
      await change(remoteId, () => binding.renameThread!(canonicalId(remoteId), title), { title });
    },
    async archive(remoteId) {
      if (binding.archiveThread === undefined) throw new Error("Conversation persistence does not support archiving threads.");
      await change(remoteId, () => binding.archiveThread!(canonicalId(remoteId)), { status: "archived" });
    },
    async unarchive(remoteId) {
      if (binding.unarchiveThread === undefined) throw new Error("Conversation persistence does not support unarchiving threads.");
      await change(remoteId, () => binding.unarchiveThread!(canonicalId(remoteId)), { status: "regular" });
    },
    async delete(remoteId) {
      if (binding.deleteThread === undefined) {
        throw new Error("Conversation persistence does not support deleting threads.");
      }
      const existing = pendingDeletes.get(remoteId);
      if (existing !== undefined) return existing;
      const deleteThread = binding.deleteThread.bind(binding);
      const deletion = Promise.resolve().then(async () => {
        const id = canonicalId(remoteId);
        await deleteThread(id);
        deletedIds.add(remoteId);
        initialized.delete(remoteId);
        for (const [localId, id] of identities) {
          if (id === canonicalId(remoteId)) identities.delete(localId);
        }
      });
      pendingDeletes.set(remoteId, deletion);
      try {
        await deletion;
      } finally {
        pendingDeletes.delete(remoteId);
      }
    },
    async generateTitle(remoteId, messages) {
      const snapshot = binding.getThreadListSnapshot?.();
      const item = [...(snapshot?.threads ?? []), ...(snapshot?.archivedThreads ?? [])].find(item => item.id === canonicalId(remoteId));
      const current = item === undefined ? initialized.get(remoteId) : metadata(item);
      // Keep existing titles; only the first user message supplies the default.
      const firstUserMessage = messages.find(message => message.role === "user");
      const title = current?.title?.trim() ? current.title : firstUserMessage?.content
        .filter(part => part.type === "text")
        .map(part => part.text)
        .join("\n").trim();
      const visibleTitle = deletedIds.has(remoteId) ? undefined : title;
      if (visibleTitle) {
        initialized.set(remoteId, {
          ...(current ?? { remoteId, status: "regular" }), title: visibleTitle,
        });
      }
      return new ReadableStream<TitleStreamChunk>({
        start(controller) {
          if (visibleTitle) {
            controller.enqueue({ type: "part-start", path: [0], part: { type: "text" } });
            controller.enqueue({ type: "text-delta", path: [0], textDelta: visibleTitle });
            controller.enqueue({ type: "part-finish", path: [0] });
          }
          controller.close();
        },
      });
    },
  };
  const localId = (remoteId: string) => [...identities].find(([, id]) => id === remoteId)?.[0] ?? remoteId;
  const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
  return { adapter, identity, localId, initialId, requestThreadId, bindThreadId, subscribe };
}
