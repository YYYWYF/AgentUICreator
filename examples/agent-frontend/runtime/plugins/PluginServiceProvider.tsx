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

export interface PluginServiceProviderProps<TState = unknown> {
  model: AppUIModel;
  registry: PluginRegistry<TState>;
  actions: UIPluginRuntimeActions;
  applicationEventRegistry?: AppEventRegistry | undefined;
  applicationEventSource?: ApplicationEventSource | undefined;
  children: ReactNode;
}

export function PluginServiceProvider<TState = unknown>({
  model,
  registry,
  actions,
  applicationEventRegistry,
  applicationEventSource,
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
      {children}
    </PluginServiceRuntimeContext.Provider>
  );
}
