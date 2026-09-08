import {
  createContext,
  useContext,
  useSyncExternalStore,
} from "react";

import { PluginServiceRuntime } from "./PluginServiceRuntime";

export const PluginServiceRuntimeContext =
  createContext<PluginServiceRuntime | null>(null);

export interface PluginServiceConsumerScope {
  pluginId: string;
  instanceId: string;
  inject: readonly string[];
  optionalInject: readonly string[];
}

export const PluginServiceConsumerContext =
  createContext<PluginServiceConsumerScope | null>(null);

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
  const consumer = useContext(PluginServiceConsumerContext);
  usePluginServiceRuntimeRevision();
  if (
    consumer !== null &&
    !consumer.inject.includes(name) &&
    !consumer.optionalInject.includes(name)
  ) {
    throw new Error(
      `Plugin "${consumer.pluginId}" instance "${consumer.instanceId}" accessed undeclared service "${name}"`,
    );
  }
  return runtime.get<T>(name);
}
