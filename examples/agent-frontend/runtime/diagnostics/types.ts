export const RUNTIME_DIAGNOSTIC_SCHEMA_VERSION = 1 as const;
export const RUNTIME_COMPOSITION_SCHEMA_VERSION = 1 as const;

export type RuntimeDiagnosticKind =
  | "plugin-render"
  | "plugin-activation"
  | "plugin-width-incompatible"
  | "application-gate"
  | "application-event-unknown"
  | "application-event-invalid-payload"
  | "plugin-event-undeclared-subscription"
  | "plugin-event-handler-error";
export type RuntimeDiagnosticStatus = "error" | "resolved";

export interface RuntimeDiagnostic {
  schemaVersion: typeof RUNTIME_DIAGNOSTIC_SCHEMA_VERSION;
  kind: RuntimeDiagnosticKind;
  code?: "PLUGIN_WIDTH_INCOMPATIBLE" | undefined;
  status: RuntimeDiagnosticStatus;
  appUIModelHash: string;
  occurredAt: string;
  pluginId?: string | undefined;
  instanceId?: string | undefined;
  pluginName?: string | undefined;
  eventName?: string | undefined;
  issuePaths?: readonly string[] | undefined;
  slotId?: string | undefined;
  slotPath?: string | undefined;
  requiredWidth?: "wide" | undefined;
  actualWidthClass?: "unknown" | "narrow" | "wide" | undefined;
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

export interface RuntimeCompositionApplication {
  phase:
    | "bootstrapping"
    | "resolving-gates"
    | "blocked"
    | "ready"
    | "error";
  activeGateInstanceId?: string | undefined;
}

export interface RuntimeCompositionSlot {
  slotId: string;
  widthClass: "unknown" | "narrow" | "wide";
  slotPath?: string | undefined;
}

export interface RuntimeCompositionSnapshot {
  schemaVersion: typeof RUNTIME_COMPOSITION_SCHEMA_VERSION;
  appUIModelHash: string;
  observedAt: string;
  application?: RuntimeCompositionApplication | undefined;
  instances: RuntimeCompositionInstance[];
  slots: RuntimeCompositionSlot[];
}

export type RuntimeCompositionReporter = (
  snapshot: RuntimeCompositionSnapshot,
) => void;

export type RuntimeDiagnosticEvent = Omit<
  RuntimeDiagnostic,
  | "schemaVersion"
  | "appUIModelHash"
  | "occurredAt"
>;

export interface RuntimePluginLocation {
  slotId: string;
  slotPath: string;
}
