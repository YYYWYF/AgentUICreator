import { useSyncExternalStore } from "react";

import type { UIPluginObservableService } from "../../framework/contracts/ui-plugin";

export function usePluginServiceSnapshot<TSnapshot>(
  service: UIPluginObservableService<TSnapshot> | undefined,
  fallback: TSnapshot,
): TSnapshot {
  const readSnapshot = (): TSnapshot =>
    service?.getSnapshot() ?? fallback;

  return useSyncExternalStore(
    service?.subscribe ?? (() => () => {}),
    readSnapshot,
    readSnapshot,
  );
}

