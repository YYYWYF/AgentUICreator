import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  ApplicationLifecycleRuntime,
  type ApplicationLifecycleSnapshot,
} from "./ApplicationLifecycleRuntime";

export const ApplicationLifecycleContext =
  createContext<ApplicationLifecycleRuntime | null>(null);

export function ApplicationLifecycleProvider({
  runtime,
  children,
}: {
  runtime: ApplicationLifecycleRuntime;
  children: ReactNode;
}) {
  return (
    <ApplicationLifecycleContext.Provider value={runtime}>
      {children}
    </ApplicationLifecycleContext.Provider>
  );
}

export function useApplicationLifecycleRuntime(): ApplicationLifecycleRuntime {
  const runtime = useOptionalApplicationLifecycleRuntime();
  if (runtime === null) {
    throw new Error("ApplicationLifecycleProvider is missing");
  }
  return runtime;
}

export function useOptionalApplicationLifecycleRuntime():
  | ApplicationLifecycleRuntime
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
