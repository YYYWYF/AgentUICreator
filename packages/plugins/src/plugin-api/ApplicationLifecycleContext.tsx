import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type { ApplicationLifecycleSnapshot, UIPluginObservableService } from "../contracts.js";
export type ApplicationLifecyclePort = UIPluginObservableService<ApplicationLifecycleSnapshot>;

export const ApplicationLifecycleContext =
  createContext<ApplicationLifecyclePort | null>(null);

export function ApplicationLifecycleProvider({
  runtime,
  children,
}: {
  runtime: ApplicationLifecyclePort;
  children: ReactNode;
}) {
  return (
    <ApplicationLifecycleContext.Provider value={runtime}>
      {children}
    </ApplicationLifecycleContext.Provider>
  );
}

export function useApplicationLifecycleRuntime(): ApplicationLifecyclePort {
  const runtime = useOptionalApplicationLifecycleRuntime();
  if (runtime === null) {
    throw new Error("ApplicationLifecycleProvider is missing");
  }
  return runtime;
}

export function useOptionalApplicationLifecycleRuntime():
  | ApplicationLifecyclePort
  | null {
  return useContext(ApplicationLifecycleContext);
}

export function useApplicationLifecycle(): ApplicationLifecycleSnapshot {
  const runtime = useApplicationLifecycleRuntime();
  return useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot,
  );
}
