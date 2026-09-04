export const RUNTIME_DIAGNOSTIC_SCHEMA_VERSION = 1 as const;
export const RUNTIME_COMPOSITION_SCHEMA_VERSION = 1 as const;

export type RuntimeDiagnosticKind = "plugin-render" | "plugin-activation";
export type RuntimeDiagnosticStatus = "error" | "resolved";

export interface RuntimeDiagnostic {
  schemaVersion: typeof RUNTIME_DIAGNOSTIC_SCHEMA_VERSION;
  kind: RuntimeDiagnosticKind;
  status: RuntimeDiagnosticStatus;
  appUIModelHash: string;
  occurredAt: string;
  pluginId: string;
  instanceId: string;
  pluginName?: string | undefined;
  slotId?: string | undefined;
  slotPath?: string | undefined;
  errorMessage?: string | undefined;
  componentStack?: string | undefined;
}

export type RuntimeDiagnosticReporter = (
  diagnostic: RuntimeDiagnostic,
) => void;

export interface RuntimeCompositionInstance {
  instanceId: string;
  pluginId: string;
  slotId: string;
  slotPath?: string | undefined;
}

export interface RuntimeCompositionSnapshot {
  schemaVersion: typeof RUNTIME_COMPOSITION_SCHEMA_VERSION;
  appUIModelHash: string;
  observedAt: string;
  instances: RuntimeCompositionInstance[];
}

export type RuntimeCompositionReporter = (
  snapshot: RuntimeCompositionSnapshot,
) => void;

export type RuntimeDiagnosticEvent = Omit<
  RuntimeDiagnostic,
  | "schemaVersion"
  | "appUIModelHash"
  | "occurredAt"
  | "slotId"
  | "slotPath"
>;

export interface RuntimePluginLocation {
  slotId: string;
  slotPath: string;
}
