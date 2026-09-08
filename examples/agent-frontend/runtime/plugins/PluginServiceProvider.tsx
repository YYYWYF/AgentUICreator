import {
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";

import type { AppUIModel } from "../../framework/contracts/app-ui-model";
import type { PluginRegistry } from "./PluginRegistry";
import { PluginServiceRuntimeContext } from "./PluginServiceContext";
import {
  PluginServiceRuntime,
  type UIPluginRuntimeActions,
} from "./PluginServiceRuntime";
import { useOptionalPluginDiagnosticContext } from "../diagnostics";
import {
  AppEventRegistry,
  AppEventRuntime,
  type ApplicationEventSource,
} from "../events";
import type { AppFrontendToolRuntime } from "../tools";
import { ApplicationLifecycleProvider } from "../application/ApplicationLifecycleContext";

export interface PluginServiceProviderProps<TState = unknown> {
  model: AppUIModel;
  registry: PluginRegistry<TState>;
  actions: UIPluginRuntimeActions;
  applicationEventRegistry?: AppEventRegistry | undefined;
  applicationEventSource?: ApplicationEventSource | undefined;
  frontendTools?: AppFrontendToolRuntime | undefined;
  children: ReactNode;
}

export function PluginServiceProvider<TState = unknown>({
  model,
  registry,
  actions,
  applicationEventRegistry,
  applicationEventSource,
  frontendTools,
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
    () => frontendTools?.connectServices(runtime.services),
    [frontendTools, runtime],
  );

  useLayoutEffect(() => {
    runtime.reconcile(model, registry, actions, diagnostics);
  }, [actions, diagnostics, model, registry, runtime]);

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
