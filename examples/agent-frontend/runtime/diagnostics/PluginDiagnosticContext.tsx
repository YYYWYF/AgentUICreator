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
  type RuntimeCompositionApplication,
  type RuntimeCompositionSlot,
  type RuntimeCompositionReporter,
  type RuntimeDiagnosticEvent,
  type RuntimeDiagnosticReporter,
  type RuntimePluginLocation,
} from "./types";

export interface PluginDiagnosticContextValue {
  appUIModelHash: string;
  locationFor(instanceId: string): RuntimePluginLocation | undefined;
  slotPathFor(slotId: string): string | undefined;
  registerMountedInstance(instance: RuntimeCompositionInstance): () => void;
  registerObservedSlot(slot: RuntimeCompositionSlot): () => void;
  updateApplicationLifecycle(application: RuntimeCompositionApplication): void;
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
  const slotPaths = createSlotLocationIndex(model);
  for (const instance of Object.values(model.pluginInstances)) {
    if (instance.mount === undefined) continue;
    const slotPath = slotPaths.get(instance.mount.slotId);
    if (slotPath !== undefined) {
      locations.set(instance.id, { slotId: instance.mount.slotId, slotPath });
    }
  }
  return locations;
}

export function createSlotLocationIndex(
  model: AppUIModel,
): ReadonlyMap<string, string> {
  const slotPaths = new Map<string, string>();
  indexPluginLocations(model.root, "root", slotPaths);
  return slotPaths;
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
      Map<symbol, RuntimeCompositionInstance>
    >(),
  );
  const observedSlots = useRef(
    new Map<string, Map<symbol, RuntimeCompositionSlot>>(),
  );
  const snapshotScheduled = useRef(false);
  const currentHash = useRef(appUIModelHash);
  const currentCompositionReporter = useRef(onRuntimeComposition);
  const currentApplication = useRef<RuntimeCompositionApplication>();
  const locations = useMemo(() => createPluginLocationIndex(model), [model]);
  const slotLocations = useMemo(() => createSlotLocationIndex(model), [model]);
  const locationFor = useCallback(
    (instanceId: string) => locations.get(instanceId),
    [locations],
  );
  const slotPathFor = useCallback(
    (slotId: string) => slotLocations.get(slotId),
    [slotLocations],
  );
  const report = useCallback(
    (event: RuntimeDiagnosticEvent) => {
      if (onRuntimeDiagnostic === undefined) {
        return;
      }
      const location = event.instanceId === undefined
        ? undefined
        : locations.get(event.instanceId);
      const resolvedLocation = event.slotId === undefined
        ? location
        : {
            slotId: event.slotId,
            ...(event.slotPath === undefined ? {} : { slotPath: event.slotPath }),
          };
      try {
        onRuntimeDiagnostic({
          schemaVersion: RUNTIME_DIAGNOSTIC_SCHEMA_VERSION,
          ...event,
          appUIModelHash,
          occurredAt: new Date().toISOString(),
          ...(resolvedLocation === undefined ? {} : resolvedLocation),
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
        .flatMap((occurrences) => {
          const instance = occurrences.values().next().value;
          return instance === undefined ? [] : [instance];
        })
        .sort(
          (left, right) =>
            left.slotId.localeCompare(right.slotId) ||
            left.instanceId.localeCompare(right.instanceId),
        );
      const slots = [...observedSlots.current.values()]
        .flatMap((occurrences) => {
          const slot = [...occurrences.values()].sort(
            (left, right) =>
              ({ narrow: 0, wide: 1, unknown: 2 })[left.widthClass] -
              ({ narrow: 0, wide: 1, unknown: 2 })[right.widthClass],
          )[0];
          return slot === undefined ? [] : [slot];
        })
        .sort((left, right) => left.slotId.localeCompare(right.slotId));
      try {
        reporter({
          schemaVersion: RUNTIME_COMPOSITION_SCHEMA_VERSION,
          appUIModelHash: currentHash.current,
          observedAt: new Date().toISOString(),
          ...(currentApplication.current === undefined
            ? {}
            : { application: currentApplication.current }),
          instances,
          slots,
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
      const occurrences =
        mountedInstances.current.get(instance.instanceId) ??
        new Map<symbol, RuntimeCompositionInstance>();
      occurrences.set(registration, instance);
      mountedInstances.current.set(instance.instanceId, occurrences);
      scheduleCompositionSnapshot();
      return () => {
        const current = mountedInstances.current.get(instance.instanceId);
        if (current?.delete(registration)) {
          if (current.size === 0) {
            mountedInstances.current.delete(instance.instanceId);
          }
          scheduleCompositionSnapshot();
        }
      };
    },
    [scheduleCompositionSnapshot],
  );
  const registerObservedSlot = useCallback(
    (slot: RuntimeCompositionSlot) => {
      const registration = Symbol(slot.slotId);
      const occurrences =
        observedSlots.current.get(slot.slotId) ??
        new Map<symbol, RuntimeCompositionSlot>();
      occurrences.set(registration, slot);
      observedSlots.current.set(slot.slotId, occurrences);
      scheduleCompositionSnapshot();
      return () => {
        const current = observedSlots.current.get(slot.slotId);
        if (current?.delete(registration)) {
          if (current.size === 0) {
            observedSlots.current.delete(slot.slotId);
          }
          scheduleCompositionSnapshot();
        }
      };
    },
    [scheduleCompositionSnapshot],
  );
  const updateApplicationLifecycle = useCallback(
    (application: RuntimeCompositionApplication) => {
      const current = currentApplication.current;
      if (
        current?.phase === application.phase &&
        current.activeGateInstanceId === application.activeGateInstanceId
      ) {
        return;
      }
      currentApplication.current = application;
      scheduleCompositionSnapshot();
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
    () => ({
      appUIModelHash,
      locationFor,
      registerMountedInstance,
      registerObservedSlot,
      slotPathFor,
      updateApplicationLifecycle,
      report,
    }),
    [
      appUIModelHash,
      locationFor,
      registerMountedInstance,
      registerObservedSlot,
      report,
      slotPathFor,
      updateApplicationLifecycle,
    ],
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
