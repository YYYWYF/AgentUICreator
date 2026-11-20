import { useSyncExternalStore } from "react";

const subscribeToNothing = (): (() => void) => () => {};

/** Selectors compare their results with Object.is; imperative reads register no data listener. */
export function useStoreValue<T>(
  subscribe: (listener: () => void) => () => void,
  read: () => T,
  enabled: boolean,
): T {
  return useSyncExternalStore(enabled ? subscribe : subscribeToNothing, read, read);
}
