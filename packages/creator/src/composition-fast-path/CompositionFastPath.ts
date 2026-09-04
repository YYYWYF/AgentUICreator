import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

import type { CreatorActivityRecorder } from "../CreatorActivityRecorder.js";
import type { CreatorRunLogger } from "../CreatorRunLogger.js";
import type { ProjectControlAdapter } from "../project-control/ProjectControlAdapter.js";
import { executeAppUIModelMutation } from "../project-control/appUIModelTool.js";
import {
  parseUIProjectInspection,
  type ProjectPluginInstance,
  type UIProjectInspection,
} from "../project-control/types.js";
import type { CreatorRuntimeDiagnosticSession } from "../runtime-diagnostics/CreatorRuntimeDiagnosticStore.js";
import { createRuntimeCompositionTool } from "../runtime-diagnostics/runtimeCompositionTool.js";
import type { CreatorValidationService } from "../validation/CreatorValidationService.js";
import { compileCompositionOperations } from "./CompositionOperationCompiler.js";
import { CompositionFastPathPlanner } from "./CompositionFastPathPlanner.js";
import { resolveCompositionTargets } from "./CompositionTargetResolver.js";
import type {
  CompositionFastPathFallbackReason,
  CompositionFastPathHandler,
  CompositionFastPathMetrics,
  CompositionFastPathMutationDiagnostic,
  CompositionFastPathPlan,
  CompositionFastPathResult,
  CompositionSummary,
  ResolvedCompositionIntent,
} from "./types.js";

const MAX_FAST_PATH_INSTANCES = 80;
const MAX_FAST_PATH_SLOTS = 40;
const COMPOSITION_ACTION_PATTERN =
  /(?:\b(?:remove|delete|enable|disable|hide|show|mount|unmount|move)\b|移除|删除|删掉|去掉|启用|禁用|隐藏|显示|挂载|卸载|移动|移到|挪到)/iu;
const SOURCE_CHANGE_PATTERN =
  /(?:\b(?:tsx?|jsx?|css|source|code|manifest|props?|component|function|file|style|layout)\b|源码|代码|样式|颜色|字体|组件|函数|逻辑|文件|新建|创建|布局)/iu;

interface CompositionPlanner {
  plan(
    userRequest: string,
    composition: CompositionSummary,
    signal?: AbortSignal | undefined,
  ): Promise<CompositionFastPathPlan>;
}

export interface CompositionFastPathOptions {
  model?: BaseChatModel | undefined;
  planner?: CompositionPlanner | undefined;
  adapter: Pick<ProjectControlAdapter, "request">;
  activity?: CreatorActivityRecorder | undefined;
  runLogger?: CreatorRunLogger | undefined;
  runtimeDiagnostics?: Pick<
    CreatorRuntimeDiagnosticSession,
    "waitForComposition" | "inspectComposition" | "inspect"
  > | undefined;
  validationService: Pick<
    CreatorValidationService,
    "ensureCurrentRevisionValidated"
  >;
}

interface MutableMetrics {
  actionCount: number;
  operationCount: number;
  plannerModelCalls: 0 | 1;
  mutationCount: 0 | 1;
  runtimeVerificationCount: 0 | 1;
  hostValidationCount: 0 | 1;
}

interface MutationSuccess {
  beforeHash: string;
  afterHash: string;
}

export function isCompositionFastPathCandidate(request: string): boolean {
  const normalized = request.normalize("NFKC").trim();
  return (
    normalized !== "" &&
    COMPOSITION_ACTION_PATTERN.test(normalized) &&
    !SOURCE_CHANGE_PATTERN.test(normalized)
  );
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function semanticNames(
  instance: ProjectPluginInstance,
  displayName: string | undefined,
): string[] {
  const names = new Set<string>();
  const add = (value: unknown): void => {
    if (typeof value === "string" && value.trim() !== "") names.add(value.trim());
  };
  add(displayName);
  add(displayName?.replace(/^Ant Design X\s*/iu, ""));
  add(instance.pluginId.replace(/^antd-x-/u, ""));
  for (const key of ["displayName", "name", "title", "label"]) {
    add(instance.props?.[key]);
  }
  return [...names];
}

export function createCompositionSummary(
  inspection: UIProjectInspection,
): CompositionSummary | undefined {
  if (
    inspection.pluginInstances.length > MAX_FAST_PATH_INSTANCES ||
    inspection.appUIModel.slots.length > MAX_FAST_PATH_SLOTS
  ) {
    return undefined;
  }
  const assets = new Map(
    inspection.pluginAssets.map((asset) => [asset.pluginId, asset]),
  );
  return {
    instances: inspection.pluginInstances.map((instance) => {
      const displayName = [
        assets.get(instance.pluginId)?.name,
        ...["displayName", "name", "title", "label"].map(
          (key) => instance.props?.[key],
        ),
      ]
        .find((value): value is string =>
          typeof value === "string" && value.trim() !== "",
        );
      return {
        instanceId: instance.id,
        pluginId: instance.pluginId,
        ...(displayName === undefined ? {} : { displayName }),
        semanticNames: semanticNames(instance, displayName),
        enabled: instance.enabled,
        ...(instance.mountedSlotId === undefined
          ? {}
          : { mountedSlotId: instance.mountedSlotId }),
      };
    }),
    slots: inspection.appUIModel.slots.map(({ slotId }) => ({ slotId })),
  };
}

function parseMutationResult(source: string):
  | { ok: true; mutation: MutationSuccess }
  | { ok: false; code: string; details: unknown } {
  let decoded: unknown;
  try {
    decoded = JSON.parse(source) as unknown;
  } catch {
    return { ok: false, code: "APP_UI_MODEL_MUTATION_INVALID_RESULT", details: source };
  }
  const envelope = record(decoded);
  if (envelope?.ok !== true) {
    const error = record(envelope?.error);
    return {
      ok: false,
      code:
        typeof error?.code === "string"
          ? error.code
          : "APP_UI_MODEL_MUTATION_FAILED",
      details: error ?? decoded,
    };
  }
  const result = record(envelope.result);
  const appUIModel = record(result?.appUIModel);
  if (
    typeof appUIModel?.beforeHash !== "string" ||
    typeof appUIModel.afterHash !== "string"
  ) {
    return {
      ok: false,
      code: "APP_UI_MODEL_MUTATION_INVALID_RESULT",
      details: decoded,
    };
  }
  return {
    ok: true,
    mutation: {
      beforeHash: appUIModel.beforeHash,
      afterHash: appUIModel.afterHash,
    },
  };
}

function parseRuntimeVerification(source: unknown): {
  passed: boolean;
  detail: unknown;
} {
  if (typeof source !== "string") return { passed: false, detail: source };
  try {
    const decoded = JSON.parse(source) as unknown;
    const envelope = record(decoded);
    const result = record(envelope?.result);
    return {
      passed: envelope?.ok === true && result?.verificationPassed === true,
      detail: decoded,
    };
  } catch {
    return { passed: false, detail: source };
  }
}

function successMessage(intents: ResolvedCompositionIntent[]): string {
  const descriptions = intents.map((intent) => {
    const target = intent.instance.displayName ?? intent.instance.instanceId;
    switch (intent.action) {
      case "remove":
        return `已移除 ${target} 插件实例。`;
      case "enable":
        return `已启用 ${target}。`;
      case "disable":
        return `已禁用 ${target}。`;
      case "unmount":
        return `已从当前 Slot 卸载 ${target}。`;
      case "mount":
        return `已将 ${target} 挂载到 ${intent.destinationSlotId}。`;
      case "move":
        return `已将 ${target} 移到 ${intent.destinationSlotId}。`;
    }
  });
  return descriptions.join("\n");
}

export function formatCompositionFastPathDiagnostic(
  diagnostic: CompositionFastPathMutationDiagnostic,
): string {
  const explanation =
    diagnostic.hostValidationFailure === undefined
      ? "Fast Path 已修改 AppUIModel，但 Runtime verification 未满足预期。"
      : "Fast Path 已修改 AppUIModel，Runtime verification 已通过，但 Creator Host static validation 未通过。";
  return `<composition-fast-path-diagnostic>${JSON.stringify(
    diagnostic,
  )}</composition-fast-path-diagnostic>\n${explanation}请基于当前状态和 validation evidence 修复，不要重复相同 mutation，也不要主动运行 Host-owned completion validations。`;
}

export class CompositionFastPath implements CompositionFastPathHandler {
  private readonly planner: CompositionPlanner;

  constructor(private readonly options: CompositionFastPathOptions) {
    if (options.planner === undefined && options.model === undefined) {
      throw new Error("Composition Fast Path requires a planner or model.");
    }
    this.planner =
      options.planner ??
      new CompositionFastPathPlanner(options.model!, options.runLogger);
  }

  async tryHandle(
    request: string,
    options: { signal?: AbortSignal | undefined } = {},
  ): Promise<CompositionFastPathResult> {
    const startedAt = Date.now();
    const metrics: MutableMetrics = {
      actionCount: 0,
      operationCount: 0,
      plannerModelCalls: 0,
      mutationCount: 0,
      runtimeVerificationCount: 0,
      hostValidationCount: 0,
    };
    await this.options.runLogger?.record("fast_path_attempted", {
      fastPath: { attempted: true },
    });

    if (!isCompositionFastPathCandidate(request)) {
      return this.fallback("not_composition_request", startedAt, metrics);
    }

    if (this.options.runtimeDiagnostics === undefined) {
      return this.fallback(
        "runtime_verification_unavailable",
        startedAt,
        metrics,
      );
    }

    let inspection: UIProjectInspection;
    try {
      inspection = parseUIProjectInspection(
        await this.options.adapter.request("inspect_ui_project"),
      );
    } catch {
      return this.fallback("project_inspection_failed", startedAt, metrics);
    }
    const composition = createCompositionSummary(inspection);
    if (composition === undefined) {
      return this.fallback(
        "composition_snapshot_too_large",
        startedAt,
        metrics,
      );
    }

    let plan: CompositionFastPathPlan;
    try {
      metrics.plannerModelCalls = 1;
      plan = await this.planner.plan(request, composition, options.signal);
    } catch {
      return this.fallback("planner_failure", startedAt, metrics);
    }
    if (plan.mode === "fallback") {
      return this.fallback(plan.reason, startedAt, metrics);
    }
    metrics.actionCount = plan.intents.length;

    const resolved = resolveCompositionTargets(plan, composition);
    if (!resolved.ok) {
      return this.fallback(resolved.reason, startedAt, metrics);
    }
    const compiled = compileCompositionOperations(resolved.intents);
    if (!compiled.ok) {
      return this.fallback(compiled.reason, startedAt, metrics);
    }
    metrics.operationCount = compiled.mutation.operations.length;

    metrics.mutationCount = 1;
    const mutationSource = await executeAppUIModelMutation(
      this.options.adapter,
      this.options.activity,
      {
        appUIModelHash: inspection.appUIModel.hash,
        operations: compiled.mutation.operations,
      },
    );
    const mutation = parseMutationResult(mutationSource);
    if (!mutation.ok) {
      return this.fallback(
        mutation.code === "APP_UI_MODEL_HASH_CONFLICT"
          ? "mutation_conflict"
          : "mutation_failed",
        startedAt,
        metrics,
      );
    }

    metrics.runtimeVerificationCount = 1;
    const runtimeTool = createRuntimeCompositionTool(
      this.options.adapter,
      this.options.runtimeDiagnostics,
    );
    let verification: ReturnType<typeof parseRuntimeVerification>;
    try {
      verification = parseRuntimeVerification(
        await runtimeTool.invoke({
          expectedAppUIModelHash: mutation.mutation.afterHash,
          expect: compiled.mutation.expectations,
        }),
      );
    } catch (error) {
      verification = {
        passed: false,
        detail:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : String(error),
      };
    }
    if (!verification.passed) {
      return this.fallback(
        "runtime_verification_failed",
        startedAt,
        metrics,
        {
          mutationApplied: true,
          beforeHash: mutation.mutation.beforeHash,
          afterHash: mutation.mutation.afterHash,
          operations: compiled.mutation.operations,
          runtimeVerificationFailure: verification.detail,
        },
      );
    }

    metrics.hostValidationCount = 1;
    const hostValidation =
      await this.options.validationService.ensureCurrentRevisionValidated(
        options,
      );
    if (hostValidation.status !== "passed") {
      return this.fallback(
        "host_validation_failed",
        startedAt,
        metrics,
        {
          mutationApplied: true,
          beforeHash: mutation.mutation.beforeHash,
          afterHash: mutation.mutation.afterHash,
          operations: compiled.mutation.operations,
          hostValidationFailure: hostValidation,
        },
      );
    }

    const finalMetrics = this.metrics(startedAt, metrics, true);
    await this.options.runLogger?.record("fast_path_finished", {
      fastPath: finalMetrics,
    });
    return {
      handled: true,
      message: successMessage(resolved.intents),
      metrics: finalMetrics,
    };
  }

  private metrics(
    startedAt: number,
    metrics: MutableMetrics,
    handled: boolean,
    fallbackReason?: CompositionFastPathFallbackReason | undefined,
  ): CompositionFastPathMetrics {
    return {
      attempted: true,
      handled,
      ...(fallbackReason === undefined ? {} : { fallbackReason }),
      actionCount: metrics.actionCount,
      operationCount: metrics.operationCount,
      durationMs: Date.now() - startedAt,
      planner: { modelCalls: metrics.plannerModelCalls },
      generalAgentCalls: handled ? 0 : 1,
      mutationCount: metrics.mutationCount,
      runtimeVerificationCount: metrics.runtimeVerificationCount,
      hostValidationCount: metrics.hostValidationCount,
    };
  }

  private async fallback(
    reason: CompositionFastPathFallbackReason,
    startedAt: number,
    metrics: MutableMetrics,
    diagnostic?: CompositionFastPathMutationDiagnostic | undefined,
  ): Promise<CompositionFastPathResult> {
    const finalMetrics = this.metrics(startedAt, metrics, false, reason);
    await this.options.runLogger?.record("fast_path_finished", {
      fastPath: finalMetrics,
      ...(diagnostic === undefined ? {} : { diagnostic }),
    });
    return {
      handled: false,
      reason,
      ...(diagnostic === undefined ? {} : { diagnostic }),
      metrics: finalMetrics,
    };
  }
}
