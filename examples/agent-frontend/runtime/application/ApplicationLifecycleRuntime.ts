import type {
  UIApplicationGateSnapshot,
  UIApplicationGateStatus,
} from "../../framework/contracts/ui-plugin";

export type ApplicationRuntimePhase =
  | "bootstrapping"
  | "resolving-gates"
  | "blocked"
  | "ready"
  | "error";

export interface ApplicationGateRuntimeEntry {
  instanceId: string;
  pluginId: string;
  priority: number;
  status: UIApplicationGateStatus;
  message?: string | undefined;
}

export interface ApplicationLifecycleFailure {
  instanceId?: string | undefined;
  pluginId?: string | undefined;
  message: string;
}

export interface ApplicationLifecycleSnapshot {
  phase: ApplicationRuntimePhase;
  gates: readonly ApplicationGateRuntimeEntry[];
  activeGateInstanceId?: string | undefined;
  failure?: ApplicationLifecycleFailure | undefined;
}

const INITIAL_SNAPSHOT: ApplicationLifecycleSnapshot = Object.freeze({
  phase: "bootstrapping",
  gates: Object.freeze([]),
});

function sameSnapshot(
  left: ApplicationLifecycleSnapshot,
  right: ApplicationLifecycleSnapshot,
): boolean {
  if (
    left.phase !== right.phase ||
    left.activeGateInstanceId !== right.activeGateInstanceId ||
    left.failure?.instanceId !== right.failure?.instanceId ||
    left.failure?.pluginId !== right.failure?.pluginId ||
    left.failure?.message !== right.failure?.message ||
    left.gates.length !== right.gates.length
  ) {
    return false;
  }
  return left.gates.every((gate, index) => {
    const candidate = right.gates[index];
    return (
      candidate !== undefined &&
      gate.instanceId === candidate.instanceId &&
      gate.pluginId === candidate.pluginId &&
      gate.priority === candidate.priority &&
      gate.status === candidate.status &&
      gate.message === candidate.message
    );
  });
}

export function isApplicationGateSnapshot(
  value: unknown,
): value is UIApplicationGateSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { status?: unknown; message?: unknown };
  return (
    (candidate.status === "checking" ||
      candidate.status === "blocked" ||
      candidate.status === "ready" ||
      candidate.status === "error") &&
    (candidate.message === undefined || typeof candidate.message === "string")
  );
}

export class ApplicationLifecycleRuntime {
  #snapshot = INITIAL_SNAPSHOT;
  readonly #listeners = new Set<() => void>();

  readonly getSnapshot = (): ApplicationLifecycleSnapshot => this.#snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  update(snapshot: ApplicationLifecycleSnapshot): void {
    const next: ApplicationLifecycleSnapshot = Object.freeze({
      ...snapshot,
      gates: Object.freeze([...snapshot.gates]),
    });
    if (sameSnapshot(this.#snapshot, next)) return;
    this.#snapshot = next;
    this.#listeners.forEach((listener) => listener());
  }
}
