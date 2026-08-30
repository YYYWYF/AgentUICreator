import {
  createContext,
  useContext,
  useSyncExternalStore,
} from "react";

import { PluginServiceRuntime } from "./PluginServiceRuntime";

export const PluginServiceRuntimeContext =
  createContext<PluginServiceRuntime | null>(null);

export function useOptionalPluginServiceRuntime(): PluginServiceRuntime | null {
  return useContext(PluginServiceRuntimeContext);
}

export function usePluginServiceRuntime(): PluginServiceRuntime {
  const runtime = useOptionalPluginServiceRuntime();
  if (runtime === null) {
    throw new Error("PluginServiceProvider is missing");
  }
  return runtime;
}

export function usePluginServiceRuntimeRevision(): number {
  const runtime = usePluginServiceRuntime();
  return useSyncExternalStore(
    runtime.subscribe,
    runtime.getRevision,
    runtime.getRevision,
  );
}

export function usePluginService<T = unknown>(name: string): T | undefined {
  const runtime = usePluginServiceRuntime();
  usePluginServiceRuntimeRevision();
  return runtime.get<T>(name);
}
