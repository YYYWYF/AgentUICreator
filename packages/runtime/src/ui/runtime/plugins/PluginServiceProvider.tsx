import {
  useEffect,
  useLayoutEffect,
  useState,
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
    runtime.reconcile(model, registry, actions, diagnostics, serviceOverrides);
  }, [actions, diagnostics, model, registry, runtime, serviceOverrides]);

  useEffect(
    () => () => {
      runtime.dispose();
    },
    [runtime],
  );

  return (
    <PluginServiceRuntimeContext.Provider value={runtime}>
      <ApplicationLifecycleProvider runtime={runtime.applicationLifecycle}>
        {children}
      </ApplicationLifecycleProvider>
    </PluginServiceRuntimeContext.Provider>
  );
}
