import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

import type {
  AppUIModel,
  LayoutNode,
} from "../../framework/contracts/app-ui-model";
import {
  RUNTIME_DIAGNOSTIC_SCHEMA_VERSION,
  type RuntimeDiagnosticEvent,
  type RuntimeDiagnosticReporter,
  type RuntimePluginLocation,
} from "./types";

export interface PluginDiagnosticContextValue {
  appUIModelHash: string;
  locationFor(instanceId: string): RuntimePluginLocation | undefined;
  report(event: RuntimeDiagnosticEvent): void;
}

export interface PluginDiagnosticProviderProps {
  appUIModelHash: string;
  children: ReactNode;
  model: AppUIModel;
  onRuntimeDiagnostic?: RuntimeDiagnosticReporter | undefined;
}

const PluginDiagnosticContext =
  createContext<PluginDiagnosticContextValue | null>(null);

function indexPluginLocations(
  node: LayoutNode,
  nodePath: string,
  slotPaths: Map<string, string>,
): void {
  if (node.type === "slot") {
    slotPaths.set(node.slotId, nodePath);
    return;
  }

  if (node.type === "panel") {
    indexPluginLocations(node.child, `${nodePath}.child`, slotPaths);
    return;
  }

  node.children.forEach((child, index) => {
    indexPluginLocations(child, `${nodePath}.children[${index}]`, slotPaths);
  });
}

export function createPluginLocationIndex(
  model: AppUIModel,
): ReadonlyMap<string, RuntimePluginLocation> {
  const locations = new Map<string, RuntimePluginLocation>();
  const slotPaths = new Map<string, string>();
  indexPluginLocations(model.root, "root", slotPaths);
  for (const instance of Object.values(model.pluginInstances)) {
    if (instance.mount === undefined) continue;
    const slotPath = slotPaths.get(instance.mount.slotId);
    if (slotPath !== undefined) {
      locations.set(instance.id, { slotId: instance.mount.slotId, slotPath });
    }
  }
  return locations;
}

export function PluginDiagnosticProvider({
  appUIModelHash,
  children,
  model,
  onRuntimeDiagnostic,
}: PluginDiagnosticProviderProps) {
  const locations = useMemo(() => createPluginLocationIndex(model), [model]);
  const locationFor = useCallback(
    (instanceId: string) => locations.get(instanceId),
    [locations],
  );
  const report = useCallback(
    (event: RuntimeDiagnosticEvent) => {
      if (onRuntimeDiagnostic === undefined) {
        return;
      }
      const location = locations.get(event.instanceId);
      try {
        onRuntimeDiagnostic({
          schemaVersion: RUNTIME_DIAGNOSTIC_SCHEMA_VERSION,
          ...event,
          appUIModelHash,
          occurredAt: new Date().toISOString(),
          ...(location === undefined ? {} : location),
        });
      } catch {
        // Diagnostics are development-only observability. A broken or missing
        // reporter must never break the generated frontend runtime.
      }
    },
    [appUIModelHash, locations, onRuntimeDiagnostic],
  );
  const value = useMemo<PluginDiagnosticContextValue>(
    () => ({ appUIModelHash, locationFor, report }),
    [appUIModelHash, locationFor, report],
  );

  return (
    <PluginDiagnosticContext.Provider value={value}>
      {children}
    </PluginDiagnosticContext.Provider>
  );
}

export function useOptionalPluginDiagnosticContext(): PluginDiagnosticContextValue | null {
  return useContext(PluginDiagnosticContext);
}
