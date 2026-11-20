import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { UIPluginServiceMap, UIPluginObservableService } from "../contracts/index.js";
import { useStoreValue } from "../observation/use-store-value.js";

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
export function usePluginService<TService extends UIPluginObservableService<unknown>>(
  service: TService,
): TService;
export function usePluginService<TService extends UIPluginObservableService<unknown>>(
  service: TService | undefined,
): TService | undefined;
export function usePluginService<TSnapshot, TValue>(
  service: UIPluginObservableService<TSnapshot>,
  selector: (snapshot: TSnapshot) => TValue,
): TValue;
export function usePluginService<TSnapshot, TValue>(
  service: UIPluginObservableService<TSnapshot> | undefined,
  selector: (snapshot: TSnapshot) => TValue,
  fallback: TSnapshot,
): TValue;
export function usePluginService<TSnapshot, TValue>(
  name: string,
  selector: (snapshot: TSnapshot) => TValue,
  fallback: TSnapshot,
): TValue;
export function usePluginService<TService extends UIPluginObservableService<unknown>, TValue>(
  service: TService,
  selector: ((snapshot: ReturnType<TService["getSnapshot"]>) => TValue) | undefined,
): TService | TValue;
export function usePluginService(
  target: string | UIPluginObservableService<unknown> | undefined,
  selector?: (snapshot: never) => unknown,
  fallback?: unknown,
): unknown {
  const runtime = useOptionalPluginServiceRuntime();
  const consumer = useContext(PluginServiceConsumerContext);
  const name = typeof target === "string" ? target : undefined;
  const subscribe = useCallback((listener: () => void) =>
    name === undefined ? () => {} : runtime?.subscribe(listener) ?? (() => {}), [runtime, name]);
  const readService = () => name === undefined ? target : runtime?.get(name);
  const service = useSyncExternalStore(subscribe, readService, readService);
  const observable = service !== null && (typeof service === "object" || typeof service === "function") &&
    "getSnapshot" in service && typeof service.getSnapshot === "function" &&
    "subscribe" in service && typeof service.subscribe === "function"
    ? service as UIPluginObservableService<unknown> : undefined;
  const subscribeData = useCallback((listener: () => void) => observable?.subscribe(listener) ?? (() => {}), [observable]);
  const selected = useStoreValue(subscribeData, () => {
    if (selector === undefined) return service;
    if (service !== undefined && observable === undefined) throw new Error("PLUGIN_SERVICE_NOT_OBSERVABLE");
    return selector((observable === undefined ? fallback : observable.getSnapshot()) as never);
  }, selector !== undefined);
  if (name !== undefined && runtime === null) throw new Error("PluginServiceProvider is missing");
  if (
    name !== undefined &&
    consumer !== null &&
    !consumer.provides.includes(name) &&
    !consumer.inject.includes(name) &&
    !consumer.optionalInject.includes(name)
  ) {
    throw new Error(
      `Plugin "${consumer.pluginId}" instance "${consumer.instanceId}" accessed undeclared service "${name}"`,
    );
  }
  return selected;
}

export interface PluginServiceRuntimeProviderProps {
  runtime: PluginServiceRuntimePort;
  children: ReactNode;
}

/** Exposes the existing project service store; never creates or activates one. */
export function PluginServiceRuntimeProvider({
  runtime,
  children,
}: PluginServiceRuntimeProviderProps) {
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

export function PluginServiceConsumerProvider({
  scope,
  children,
}: PluginServiceConsumerProviderProps) {
  return (
    <PluginServiceConsumerContext.Provider value={scope}>
      {children}
    </PluginServiceConsumerContext.Provider>
  );
}
