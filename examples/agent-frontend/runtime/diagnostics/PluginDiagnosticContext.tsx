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
  const childSlots = new Map<string, string[]>();
  Object.values(model.slots).forEach((slot) => {
    if (slot.owner.type !== "plugin-instance") return;
    const owned = childSlots.get(slot.owner.instanceId) ?? [];
    owned.push(slot.id);
    childSlots.set(slot.owner.instanceId, owned);
  });

  const visitSlot = (slotId: string, slotPath: string, seen: Set<string>): void => {
    if (seen.has(slotId)) return;
    const slot = model.slots[slotId];
    if (slot === undefined) return;
    const branch = new Set(seen);
    branch.add(slotId);
    slot.occupants.forEach((occupant) => {
      locations.set(occupant.instanceId, { slotId, slotPath });
      (childSlots.get(occupant.instanceId) ?? []).forEach((childSlotId) => {
        const child = model.slots[childSlotId];
        const outlet = child?.owner.type === "plugin-instance"
          ? child.owner.outlet
          : childSlotId;
        visitSlot(
          childSlotId,
          `${slotPath}.occupants[${occupant.instanceId}].slots[${outlet}]`,
          branch,
        );
      });
    });
  };

  slotPaths.forEach((slotPath, slotId) => visitSlot(slotId, slotPath, new Set()));
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
