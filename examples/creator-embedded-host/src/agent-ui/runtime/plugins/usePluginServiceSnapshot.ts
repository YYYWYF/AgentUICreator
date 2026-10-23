import { useCallback, useSyncExternalStore } from "react";

import type { UIPluginObservableService } from "../../framework/contracts/ui-plugin";

const subscribeToNothing = (): (() => void) => () => undefined;

export function usePluginServiceSnapshot<TSnapshot>(
  service: UIPluginObservableService<TSnapshot> | undefined,
  fallback: TSnapshot,
): TSnapshot {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (service === undefined) {
        return subscribeToNothing();
      }

      return service.subscribe(listener);
    },
    [service],
  );

  const getSnapshot = useCallback(
    () => service?.getSnapshot() ?? fallback,
    [service, fallback],
  );

  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot,
  );
}
