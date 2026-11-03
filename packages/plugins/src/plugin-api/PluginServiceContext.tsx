import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { UIPluginServiceMap } from "../contracts.js";

/** Structural port: activation and composition remain owned by the project. */
export interface PluginServiceRuntimePort {
  get<T = unknown>(name: string): T | undefined;
  subscribe(listener: () => void): () => void;
  getRevision(): number;
}

export const PluginServiceRuntimeContext =
  createContext<PluginServiceRuntimePort | null>(null);

export interface PluginServiceConsumerScope {
  pluginId: string;
  instanceId: string;
  provides: readonly string[];
  inject: readonly string[];
  optionalInject: readonly string[];
}

export const PluginServiceConsumerContext =
  createContext<PluginServiceConsumerScope | null>(null);

export function useOptionalPluginServiceRuntime(): PluginServiceRuntimePort | null {
  return useContext(PluginServiceRuntimeContext);
}

export function usePluginServiceRuntime(): PluginServiceRuntimePort {
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

export function usePluginService<K extends keyof UIPluginServiceMap & string>(
  name: K,
): UIPluginServiceMap[K] | undefined;
export function usePluginService<T = unknown>(name: string): T | undefined;
export function usePluginService<T = unknown>(name: string): T | undefined {
  const runtime = usePluginServiceRuntime();
  const consumer = useContext(PluginServiceConsumerContext);
  usePluginServiceRuntimeRevision();
  if (
    consumer !== null &&
    !consumer.provides.includes(name) &&
    !consumer.inject.includes(name) &&
    !consumer.optionalInject.includes(name)
  ) {
    throw new Error(
      `Plugin "${consumer.pluginId}" instance "${consumer.instanceId}" accessed undeclared service "${name}"`,
    );
  }
  return runtime.get<T>(name);
}

export interface PluginServiceRuntimeProviderProps {
  runtime: PluginServiceRuntimePort;
  children: ReactNode;
}

/** Exposes the existing project service store; never creates or activates one. */
export function PluginServiceRuntimeProvider({ runtime, children }: PluginServiceRuntimeProviderProps) {
  return (
    <PluginServiceRuntimeContext.Provider value={runtime}>
      {children}
    </PluginServiceRuntimeContext.Provider>
  );
}

export interface PluginServiceConsumerProviderProps {
  scope: PluginServiceConsumerScope;
  children: ReactNode;
}

export function PluginServiceConsumerProvider({ scope, children }: PluginServiceConsumerProviderProps) {
  return (
    <PluginServiceConsumerContext.Provider value={scope}>
      {children}
    </PluginServiceConsumerContext.Provider>
  );
}
