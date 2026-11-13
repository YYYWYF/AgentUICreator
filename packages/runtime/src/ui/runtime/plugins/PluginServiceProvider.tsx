import {
  useEffect,
  useLayoutEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";

import type { AppUIRuntimeModel } from "../../framework/contracts/app-ui-runtime-model.js";
import type { PluginRegistry } from "./PluginRegistry.js";
import { PluginServiceRuntimeContext } from "./PluginServiceContext.js";
import {
  PluginServiceRuntime,
  type UIPluginRuntimeActions,
} from "./PluginServiceRuntime.js";
import { useOptionalPluginDiagnosticContext } from "../diagnostics/index.js";
import {
  AppEventRegistry,
  AppEventRuntime,
  type ApplicationEventSource,
} from "../events/index.js";
import type { AppFrontendToolRuntime } from "../tools/index.js";
import { ApplicationLifecycleProvider } from "../application/ApplicationLifecycleContext.js";

export interface PluginServiceProviderProps<TState = unknown> {
  model: AppUIRuntimeModel;
  registry: PluginRegistry<TState>;
  actions: UIPluginRuntimeActions;
  applicationEventRegistry?: AppEventRegistry | undefined;
  applicationEventSource?: ApplicationEventSource | undefined;
  frontendTools?: AppFrontendToolRuntime | undefined;
  serviceOverrides?: Readonly<Record<string, unknown>> | undefined;
  children: ReactNode;
}

export function PluginServiceProvider<TState = unknown>({
  model,
  registry,
  actions,
  applicationEventRegistry,
  applicationEventSource,
  frontendTools,
  serviceOverrides,
  children,
}: PluginServiceProviderProps<TState>) {
  const [eventRuntime] = useState(
    () => new AppEventRuntime(
      applicationEventRegistry ?? new AppEventRegistry({}),
    ),
  );
  const [runtime] = useState(() => new PluginServiceRuntime(eventRuntime));
  const diagnostics = useOptionalPluginDiagnosticContext();
  // Hosts may compose an equivalent override map on each render. Reconcile only
  // when a provided service actually changes, preserving mounted sessions.
  const overrides = useRef(serviceOverrides);
  const previousNames = Object.keys(overrides.current ?? {});
  const nextNames = Object.keys(serviceOverrides ?? {});
  if (previousNames.length !== nextNames.length ||
      nextNames.some(name => !Object.hasOwn(overrides.current ?? {}, name) || overrides.current?.[name] !== serviceOverrides?.[name])) {
    overrides.current = serviceOverrides;
  }
  const stableOverrides = overrides.current;

  useLayoutEffect(
    () => eventRuntime.setDiagnosticReporter(diagnostics?.report),
    [diagnostics, eventRuntime],
  );

  useLayoutEffect(
    () => applicationEventSource === undefined
      ? undefined
      : eventRuntime.connect(applicationEventSource),
    [applicationEventSource, eventRuntime],
  );

  useLayoutEffect(
    () => frontendTools?.connectServices(runtime.services, runtime.subscribe),
    [frontendTools, runtime],
  );

  useLayoutEffect(() => {
    if (applicationEventRegistry) eventRuntime.setRegistry(applicationEventRegistry);
  }, [applicationEventRegistry, eventRuntime]);

  useLayoutEffect(() => {
    runtime.reconcile(model, registry, actions, diagnostics, stableOverrides);
  }, [actions, diagnostics, model, registry, runtime, stableOverrides]);

  const disposal = useRef(0);
  useEffect(() => {
    ++disposal.current;
    return () => {
      const epoch = ++disposal.current;
      // StrictMode immediately reconnects this owner. Dispose only a real
      // unmount, so its rehearsal cannot revoke an opened persisted thread.
      queueMicrotask(() => { if (disposal.current === epoch) runtime.dispose(); });
    };
  }, [runtime]);

  return (
    <PluginServiceRuntimeContext.Provider value={runtime}>
      <ApplicationLifecycleProvider runtime={runtime.applicationLifecycle}>
        {children}
      </ApplicationLifecycleProvider>
    </PluginServiceRuntimeContext.Provider>
  );
}
