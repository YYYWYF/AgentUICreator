/** A cached presentation projection; canonical data remains owned by its source. */
export function createSnapshotStore<T>(initial: T) {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    publish(next: T) {
      if (Object.is(snapshot, next)) return;
      snapshot = next;
      for (const listener of listeners) listener();
    },
  };
}
