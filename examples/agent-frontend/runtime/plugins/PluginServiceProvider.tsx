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

export interface PluginServiceProviderProps {
  model: AppUIModel;
  registry: PluginRegistry;
  actions: UIPluginRuntimeActions;
  children: ReactNode;
}

export function PluginServiceProvider({
  model,
  registry,
  actions,
  children,
}: PluginServiceProviderProps) {
  const [runtime] = useState(() => new PluginServiceRuntime());
  const diagnostics = useOptionalPluginDiagnosticContext();

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
