import type { RuntimeCompositionExpectation } from "../runtime-diagnostics/runtimeCompositionTool.js";

export type CompositionIntent =
  | { action: "remove"; target: string }
  | { action: "enable"; target: string }
  | { action: "disable"; target: string }
  | { action: "unmount"; target: string }
  | { action: "mount"; target: string; destination: string }
  | { action: "move"; target: string; destination: string };

export type CompositionPlannerFallbackReason =
  | "not_composition_request"
  | "unsupported_action"
  | "requires_source_change";

export type CompositionFastPathPlan =
  | { mode: "composition"; intents: CompositionIntent[] }
  | { mode: "fallback"; reason: CompositionPlannerFallbackReason };

export interface CompositionSummaryInstance {
  instanceId: string;
  pluginId: string;
  displayName?: string | undefined;
  semanticNames: string[];
  enabled: boolean;
  mountedSlotId?: string | undefined;
}

export interface CompositionSummary {
  instances: CompositionSummaryInstance[];
  slots: Array<{ slotId: string }>;
}

export type CompositionFastPathFallbackReason =
  | CompositionPlannerFallbackReason
  | "planner_failure"
  | "invalid_plan"
  | "project_inspection_failed"
  | "composition_snapshot_too_large"
  | "target_not_found"
  | "ambiguous_target"
  | "slot_not_found"
  | "ambiguous_slot"
  | "invalid_operation"
  | "mutation_conflict"
  | "mutation_failed"
  | "runtime_verification_unavailable"
  | "runtime_verification_failed";

export interface ResolvedCompositionIntent {
  action: CompositionIntent["action"];
  instance: CompositionSummaryInstance;
  destinationSlotId?: string | undefined;
}

export interface CompiledCompositionMutation {
  operations: unknown[];
  expectations: RuntimeCompositionExpectation[];
}

export interface CompositionFastPathMetrics {
  attempted: true;
  handled: boolean;
  fallbackReason?: CompositionFastPathFallbackReason | undefined;
  actionCount: number;
  operationCount: number;
  durationMs: number;
  planner: { modelCalls: 0 | 1 };
  generalAgentCalls: 0 | 1;
  mutationCount: 0 | 1;
  runtimeVerificationCount: 0 | 1;
}

export interface CompositionFastPathMutationDiagnostic {
  mutationApplied: true;
  beforeHash: string;
  afterHash: string;
  operations: unknown[];
  verificationFailure: unknown;
}

export type CompositionFastPathResult =
  | {
      handled: true;
      message: string;
      metrics: CompositionFastPathMetrics;
    }
  | {
      handled: false;
      reason: CompositionFastPathFallbackReason;
      diagnostic?: CompositionFastPathMutationDiagnostic | undefined;
      metrics: CompositionFastPathMetrics;
    };

export interface CompositionFastPathHandleOptions {
  signal?: AbortSignal | undefined;
}

export interface CompositionFastPathHandler {
  tryHandle(
    request: string,
    options?: CompositionFastPathHandleOptions,
  ): Promise<CompositionFastPathResult>;
}
