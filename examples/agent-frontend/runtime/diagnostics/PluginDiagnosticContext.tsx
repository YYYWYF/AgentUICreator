import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

import type {
  AppUIModel,
  LayoutNode,
} from "../../framework/contracts/app-ui-model";
import {
  RUNTIME_COMPOSITION_SCHEMA_VERSION,
  RUNTIME_DIAGNOSTIC_SCHEMA_VERSION,
  type RuntimeCompositionInstance,
  type RuntimeCompositionReporter,
  type RuntimeDiagnosticEvent,
  type RuntimeDiagnosticReporter,
  type RuntimePluginLocation,
} from "./types";

export interface PluginDiagnosticContextValue {
  appUIModelHash: string;
  locationFor(instanceId: string): RuntimePluginLocation | undefined;
  registerMountedInstance(instance: RuntimeCompositionInstance): () => void;
  report(event: RuntimeDiagnosticEvent): void;
}

export interface PluginDiagnosticProviderProps {
  appUIModelHash: string;
  children: ReactNode;
  model: AppUIModel;
  onRuntimeComposition?: RuntimeCompositionReporter | undefined;
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
  onRuntimeComposition,
  onRuntimeDiagnostic,
}: PluginDiagnosticProviderProps) {
  const mountedInstances = useRef(
    new Map<
      string,
      { instance: RuntimeCompositionInstance; registration: symbol }
    >(),
  );
  const snapshotScheduled = useRef(false);
  const currentHash = useRef(appUIModelHash);
  const currentCompositionReporter = useRef(onRuntimeComposition);
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
  const scheduleCompositionSnapshot = useCallback(() => {
    if (snapshotScheduled.current) return;
    snapshotScheduled.current = true;
    queueMicrotask(() => {
      snapshotScheduled.current = false;
      const reporter = currentCompositionReporter.current;
      if (reporter === undefined) return;
      const instances = [...mountedInstances.current.values()]
        .map(({ instance }) => instance)
        .sort(
          (left, right) =>
            left.slotId.localeCompare(right.slotId) ||
            left.instanceId.localeCompare(right.instanceId),
        );
      try {
        reporter({
          schemaVersion: RUNTIME_COMPOSITION_SCHEMA_VERSION,
          appUIModelHash: currentHash.current,
          observedAt: new Date().toISOString(),
          instances,
        });
      } catch {
        // Composition reporting is optional development observability and
        // must never break the generated frontend runtime.
      }
    });
  }, []);
  const registerMountedInstance = useCallback(
    (instance: RuntimeCompositionInstance) => {
      const registration = Symbol(instance.instanceId);
      mountedInstances.current.set(instance.instanceId, {
        instance,
        registration,
      });
      scheduleCompositionSnapshot();
      return () => {
        const current = mountedInstances.current.get(instance.instanceId);
        if (current?.registration === registration) {
          mountedInstances.current.delete(instance.instanceId);
          scheduleCompositionSnapshot();
        }
      };
    },
    [scheduleCompositionSnapshot],
  );

  useLayoutEffect(() => {
    currentHash.current = appUIModelHash;
    currentCompositionReporter.current = onRuntimeComposition;
  }, [appUIModelHash, onRuntimeComposition]);

  useEffect(() => {
    scheduleCompositionSnapshot();
  }, [appUIModelHash, onRuntimeComposition, scheduleCompositionSnapshot]);

  const value = useMemo<PluginDiagnosticContextValue>(
    () => ({ appUIModelHash, locationFor, registerMountedInstance, report }),
    [appUIModelHash, locationFor, registerMountedInstance, report],
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
