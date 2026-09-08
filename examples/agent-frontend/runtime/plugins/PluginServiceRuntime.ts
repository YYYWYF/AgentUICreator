import type {
  AppUIModel,
  PluginInstance,
} from "../../framework/contracts/app-ui-model";
import {
  AppUICompositionError,
  resolveApplicationFoundation,
  validateAppUIComposition,
} from "../../framework/contracts/app-ui-composition";
import { SlotRegistry } from "../slots/SlotRegistry";
import type {
  AgentUserInput,
  AgentInterruptResponse,
  UIPluginActions,
  UIPluginDefinition,
  UIPluginEvents,
  UIApplicationGateService,
  UIPluginServiceRegistrar,
  UIPluginServices,
} from "../../framework/contracts/ui-plugin";
import {
  createPluginCompositionCatalog,
  type PluginRegistry,
} from "./PluginRegistry";
import type { PluginDiagnosticContextValue } from "../diagnostics";
import { AppEventRegistry, AppEventRuntime } from "../events";
import {
  ApplicationLifecycleRuntime,
  isApplicationGateSnapshot,
  type ApplicationGateRuntimeEntry,
  type ApplicationLifecycleFailure,
} from "../application/ApplicationLifecycleRuntime";

export interface UIPluginRuntimeActions {
  sendMessage(input: string | AgentUserInput): Promise<void>;
  resumeInterrupts(responses: AgentInterruptResponse[]): Promise<void>;
  startNewConversation(): Promise<void>;
  abortRun(): void;
  updateInstanceProps(
    instanceId: string,
    props: Record<string, unknown>,
  ): void;
}

export type PluginActivationState =
  | {
      status: "active";
      activationId: number;
    }
  | {
      status: "pending";
      missingServices: readonly string[];
    }
  | {
      status: "failed";
      errorMessage: string;
    };

interface ServiceRecord {
  ownerInstanceId: string;
  value: unknown;
}

interface ActivePluginRecord {
  instanceId: string;
  stage: "foundation" | "workspace";
  cleanups: Array<() => void>;
}

interface ActivationCandidate<TState = unknown> {
  instance: PluginInstance;
  definition: UIPluginDefinition<TState>;
}

interface ReconcileState {
  model: AppUIModel;
  registry: PluginRegistry<unknown>;
  actions: UIPluginRuntimeActions;
  diagnostics?: PluginDiagnosticContextValue | null;
  foundationInstanceIds: ReadonlySet<string>;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assertServiceName(name: string): void {
  if (
    /^(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*)$/.test(
      name,
    ) === false
  ) {
    throw new Error(
      `UI plugin service name "${name}" must use lowercase dot-separated format`,
    );
  }
}

export function createInstanceActions(
  instance: PluginInstance,
  actions: UIPluginRuntimeActions,
): UIPluginActions {
  return {
    sendMessage: actions.sendMessage,
    resumeInterrupts: actions.resumeInterrupts,
    startNewConversation: actions.startNewConversation,
    abortRun: actions.abortRun,
    updateInstanceProps: (props) => {
      actions.updateInstanceProps(instance.id, props);
    },
  };
}

/**
 * Instance-scoped named services for UI plugins.
 *
 * Workspace activations are rebuilt when AppUIModel changes. Application Gate
 * foundations are retained while their definition, dependency graph, and
 * instance props signature remains stable.
 */
export class PluginServiceRuntime {
  readonly slots = new SlotRegistry();
  readonly applicationEvents: AppEventRuntime;
  readonly applicationLifecycle = new ApplicationLifecycleRuntime();
  readonly #services = new Map<string, ServiceRecord>();
  readonly #eventScopes = new Map<string, UIPluginEvents>();
  readonly #activations = new Map<string, PluginActivationState>();
  readonly #activationStages = new Map<string, ActivePluginRecord["stage"]>();
  readonly #listeners = new Set<() => void>();
  readonly #activePlugins: ActivePluginRecord[] = [];
  #activationCounter = 0;
  #revision = 0;
  #mutationBatchDepth = 0;
  #serviceMutationPending = false;
  #foundationSignature: string | undefined;
  #currentState: ReconcileState | undefined;
  #workspaceReconciled = false;
  #gateSubscriptionCleanups: Array<() => void> = [];
  #reportedGateFailures = new Set<string>();
  readonly #definitionIds = new WeakMap<object, number>();
  #definitionCounter = 0;

  constructor(
    applicationEvents = new AppEventRuntime(new AppEventRegistry({})),
  ) {
    this.applicationEvents = applicationEvents;
  }

  readonly services: UIPluginServices = {
    get: <T = unknown>(name: string): T | undefined => this.get<T>(name),
  };

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  readonly getRevision = (): number => this.#revision;

  get<T = unknown>(name: string): T | undefined {
    return this.#services.get(name)?.value as T | undefined;
  }

  getActivation(instanceId: string): PluginActivationState | undefined {
    return this.#activations.get(instanceId);
  }

  getEvents(instanceId: string): UIPluginEvents | undefined {
    return this.#eventScopes.get(instanceId);
  }

  reconcile<TState = unknown>(
    model: AppUIModel,
    registry: PluginRegistry<TState>,
    actions: UIPluginRuntimeActions,
    diagnostics?: PluginDiagnosticContextValue | null,
  ): void {
    const catalog = createPluginCompositionCatalog(registry);
    try {
      validateAppUIComposition(model, catalog);
    } catch (error) {
      if (
        !(error instanceof AppUICompositionError) ||
        error.issues.some((issue) => !issue.code.startsWith("application-gate-"))
      ) {
        throw error;
      }
      this.#beginMutationBatch();
      try {
        this.#deactivateAll();
        this.#foundationSignature = undefined;
        this.#currentState = undefined;
        const issue = error.issues[0]!;
        const instance = model.pluginInstances[issue.instanceId];
        this.#setApplicationFailure(
          {
            instanceId: issue.instanceId,
            pluginId: instance?.pluginId,
            message: issue.message,
          },
          diagnostics,
        );
      } finally {
        this.#endMutationBatch(true);
      }
      return;
    }

    const foundation = resolveApplicationFoundation(model, catalog);
    const gateInstanceIds = foundation.gateInstanceIds;
    const erasedRegistry = registry as PluginRegistry<unknown>;
    const nextState: ReconcileState = {
      model,
      registry: erasedRegistry,
      actions,
      diagnostics,
      foundationInstanceIds: foundation.foundationInstanceIds,
    };

    this.#beginMutationBatch();
    try {
      const previouslyFailed = new Set(
        [...this.#activations]
          .filter(([, activation]) => activation.status === "failed")
          .map(([instanceId]) => instanceId),
      );
      if (gateInstanceIds.size === 0) {
        this.#deactivateAll();
        this.#foundationSignature = undefined;
        this.#currentState = nextState;
        this.#resolveGateFailures([], diagnostics);
        this.applicationLifecycle.update({ phase: "bootstrapping", gates: [] });
        this.#activateCandidates(
          this.#workspaceCandidates(nextState),
          "workspace",
          actions,
          diagnostics,
          previouslyFailed,
        );
        this.#workspaceReconciled = true;
        this.applicationLifecycle.update({ phase: "ready", gates: [] });
        return;
      }

      const signature = this.#createFoundationSignature(
        model,
        erasedRegistry,
        foundation.foundationInstanceIds,
      );
      const foundationChanged = signature !== this.#foundationSignature;
      this.#currentState = nextState;
      this.#deactivateStage("workspace");
      this.#workspaceReconciled = false;

      if (foundationChanged) {
        this.#clearGateSubscriptions();
        this.#deactivateStage("foundation");
        this.applicationLifecycle.update({
          phase: "resolving-gates",
          gates: [],
        });
        this.#activateCandidates(
          this.#foundationCandidates(nextState),
          "foundation",
          actions,
          diagnostics,
          previouslyFailed,
        );
        this.#foundationSignature = signature;
        if (!this.#connectGateServices()) return;
      }

      this.#synchronizeApplicationGates();
    } finally {
      this.#endMutationBatch(true);
    }
  }

  dispose(): void {
    if (
      this.#activePlugins.length === 0 &&
      this.#activations.size === 0 &&
      this.#services.size === 0
    ) {
      return;
    }

    this.#beginMutationBatch();
    try {
      this.#deactivateAll();
      this.#foundationSignature = undefined;
      this.#currentState = undefined;
      this.applicationLifecycle.update({ phase: "bootstrapping", gates: [] });
    } finally {
      this.#endMutationBatch(true);
    }
  }

  #activate<TState = unknown>(
    instance: PluginInstance,
    definition: UIPluginDefinition<TState>,
    actions: UIPluginRuntimeActions,
    diagnostics?: PluginDiagnosticContextValue | null,
    reportResolution = false,
    stage: "foundation" | "workspace" = "workspace",
  ): void {
    const record: ActivePluginRecord = {
      instanceId: instance.id,
      stage,
      cleanups: [],
    };
    this.#activationStages.set(instance.id, stage);
    const declaredProvides = [...(definition.provides ?? [])];
    const declaredConsumes = new Set([
      ...(definition.inject ?? []),
      ...(definition.optionalInject ?? []),
    ]);
    const providedByThisInstance = new Set<string>();
    this.#activePlugins.push(record);

    const registrar: UIPluginServiceRegistrar = {
      get: <T = unknown>(name: string): T | undefined => {
        assertServiceName(name);
        if (!declaredConsumes.has(name)) {
          throw new Error(
            `Plugin "${definition.manifest.id}" instance "${instance.id}" accessed undeclared service "${name}"`,
          );
        }
        return this.get<T>(name);
      },
      provide: <T>(name: string, value: T): (() => void) => {
        assertServiceName(name);
        if (!declaredProvides.includes(name)) {
          throw new Error(
            `Plugin "${definition.manifest.id}" did not declare service "${name}" in provides`,
          );
        }

        const current = this.#services.get(name);
        if (current !== undefined) {
          throw new Error(
            `UI plugin service "${name}" is already provided by instance "${current.ownerInstanceId}"`,
          );
        }

        const serviceRecord: ServiceRecord = {
          ownerInstanceId: instance.id,
          value,
        };
        if (providedByThisInstance.has(name)) {
          throw new Error(
            `Plugin "${definition.manifest.id}" already provided service "${name}" in this activation`,
          );
        }
        this.#services.set(name, serviceRecord);
        providedByThisInstance.add(name);
        this.#serviceMutated();

        let active = true;
        const disposeService = (): void => {
          if (!active) {
            return;
          }
          active = false;

          if (this.#services.get(name) === serviceRecord) {
            this.#services.delete(name);
            this.#serviceMutated();
          }
        };
        record.cleanups.push(disposeService);
        return disposeService;
      },
    };

    try {
      const eventScope = this.applicationEvents.createPluginEvents({
        pluginId: definition.manifest.id,
        instanceId: instance.id,
        declaredEventNames: definition.manifest.data?.events ?? [],
      });
      this.#eventScopes.set(instance.id, eventScope);
      record.cleanups.push(() => {
        eventScope.dispose();
        if (this.#eventScopes.get(instance.id) === eventScope) {
          this.#eventScopes.delete(instance.id);
        }
      });

      const cleanup = definition.setup?.({
        instance,
        actions: createInstanceActions(instance, actions),
        events: eventScope,
        services: registrar,
      });

      if (cleanup !== undefined) {
        record.cleanups.push(cleanup);
      }

      if (instance.mount !== undefined) {
        const mount = instance.mount;
        record.cleanups.push(
          this.slots.inject(mount.slotId, () => {
            const contributionCleanups: Array<() => void> = [];
            const cleanupContribution = (): void => {
              for (const cleanup of [...contributionCleanups].reverse()) {
                try {
                  cleanup();
                } catch {
                  // Complete rollback even when one child declaration has a
                  // faulty injection cleanup.
                }
              }
              contributionCleanups.length = 0;
            };

            try {
              contributionCleanups.push(
                this.slots.register({
                  instanceId: instance.id,
                  slotId: mount.slotId,
                  ...(mount.order === undefined ? {} : { order: mount.order }),
                }),
              );
              for (const slotId of definition.manifest.slots?.children ?? []) {
                contributionCleanups.push(
                  this.slots.declare({
                    slotId,
                    owner: { kind: "plugin", instanceId: instance.id },
                  }),
                );
              }
            } catch (error) {
              cleanupContribution();
              throw error;
            }

            return cleanupContribution;
          }),
        );
      }

      for (const name of declaredProvides) {
        const recordValue = this.#services.get(name);
        if (recordValue === undefined || recordValue.ownerInstanceId !== instance.id) {
          throw new Error(
            `Plugin "${definition.manifest.id}" did not provide required service "${name}" during activation`,
          );
        }
      }
      this.#activations.set(instance.id, {
        status: "active",
        activationId: ++this.#activationCounter,
      });
      if (reportResolution) {
        diagnostics?.report({
          kind: definition.manifest.application?.gate === undefined
            ? "plugin-activation"
            : "application-gate",
          status: "resolved",
          pluginId: definition.manifest.id,
          pluginName: definition.manifest.name,
          instanceId: instance.id,
        });
      }
    } catch (error) {
      this.#runCleanups(record);
      const recordIndex = this.#activePlugins.indexOf(record);
      if (recordIndex >= 0) {
        this.#activePlugins.splice(recordIndex, 1);
      }
      this.#activations.set(instance.id, {
        status: "failed",
        errorMessage: toErrorMessage(error),
      });
      diagnostics?.report({
        kind: definition.manifest.application?.gate === undefined
          ? "plugin-activation"
          : "application-gate",
        status: "error",
        pluginId: definition.manifest.id,
        pluginName: definition.manifest.name,
        instanceId: instance.id,
        errorMessage: toErrorMessage(error),
      });
      if (
        definition.manifest.application?.gate !== undefined &&
        diagnostics != null
      ) {
        this.#reportedGateFailures.add(instance.id);
      }
    }
  }

  #deactivateAll(): void {
    this.#clearGateSubscriptions();
    for (const record of [...this.#activePlugins].reverse()) {
      this.#runCleanups(record);
    }
    this.#activePlugins.length = 0;
    if (this.#services.size > 0) {
      this.#services.clear();
      this.#serviceMutated();
    }
    this.#eventScopes.clear();
    this.#activations.clear();
    this.#activationStages.clear();
    this.#workspaceReconciled = false;
  }

  #deactivateStage(stage: ActivePluginRecord["stage"]): void {
    for (const record of [...this.#activePlugins].reverse()) {
      if (record.stage !== stage) continue;
      this.#runCleanups(record);
      const index = this.#activePlugins.indexOf(record);
      if (index >= 0) this.#activePlugins.splice(index, 1);
      this.#activations.delete(record.instanceId);
      this.#eventScopes.delete(record.instanceId);
    }
    for (const [instanceId, activationStage] of [...this.#activationStages]) {
      if (activationStage !== stage) continue;
      this.#activations.delete(instanceId);
      this.#eventScopes.delete(instanceId);
      this.#activationStages.delete(instanceId);
    }
    if (stage === "workspace") this.#workspaceReconciled = false;
  }

  #activateCandidates(
    candidates: readonly ActivationCandidate[],
    stage: ActivePluginRecord["stage"],
    actions: UIPluginRuntimeActions,
    diagnostics: PluginDiagnosticContextValue | null | undefined,
    previouslyFailed = new Set<string>(),
  ): void {
    const pending = new Map(
      candidates.map((candidate) => [candidate.instance.id, candidate] as const),
    );
    while (pending.size > 0) {
      const hardReady = [...pending].filter(([, candidate]) =>
        (candidate.definition.inject ?? []).every((name) => this.#services.has(name)),
      );
      if (hardReady.length === 0) break;
      const preferred = hardReady.filter(([, candidate]) =>
        (candidate.definition.optionalInject ?? []).every(
          (name) =>
            this.#services.has(name) ||
            ![...pending.values()].some((other) =>
              (other.definition.provides ?? []).includes(name),
            ),
        ),
      );
      const selected = preferred[0] ?? hardReady[0];
      if (selected === undefined) break;
      const [instanceId, candidate] = selected;
      pending.delete(instanceId);
      this.#activate(
        candidate.instance,
        candidate.definition,
        actions,
        diagnostics,
        previouslyFailed.has(instanceId),
        stage,
      );
    }
    for (const [instanceId, candidate] of pending) {
      this.#activationStages.set(instanceId, stage);
      this.#activations.set(instanceId, {
        status: "pending",
        missingServices: (candidate.definition.inject ?? []).filter(
          (name) => !this.#services.has(name),
        ),
      });
    }
  }

  #foundationCandidates(state: ReconcileState): ActivationCandidate[] {
    return [...state.foundationInstanceIds]
      .sort()
      .flatMap((instanceId) => {
        const instance = state.model.pluginInstances[instanceId];
        const definition = instance === undefined
          ? undefined
          : state.registry.get(instance.pluginId);
        return instance === undefined || definition === undefined
          ? []
          : [{ instance, definition }];
      });
  }

  #workspaceCandidates(state: ReconcileState): ActivationCandidate[] {
    return Object.values(state.model.pluginInstances)
      .filter((instance) => {
        if (!instance.enabled || state.foundationInstanceIds.has(instance.id)) return false;
        const definition = state.registry.get(instance.pluginId);
        return (
          instance.mount !== undefined ||
          definition?.manifest.capabilities?.includes("headless") === true
        );
      })
      .sort((left, right) => left.id.localeCompare(right.id))
      .flatMap((instance) => {
        const definition = state.registry.get(instance.pluginId);
        return definition === undefined ? [] : [{ instance, definition }];
      });
  }

  #createFoundationSignature(
    model: AppUIModel,
    registry: PluginRegistry<unknown>,
    instanceIds: ReadonlySet<string>,
  ): string {
    const entries = [...instanceIds].sort().map((instanceId) => {
      const instance = model.pluginInstances[instanceId];
      const definition = instance === undefined
        ? undefined
        : registry.get(instance.pluginId);
      if (definition === undefined) return { instance, definitionId: 0 };
      let definitionId = this.#definitionIds.get(definition);
      if (definitionId === undefined) {
        definitionId = ++this.#definitionCounter;
        this.#definitionIds.set(definition, definitionId);
      }
      return {
        instance,
        definitionId,
        provides: definition.provides ?? [],
        inject: definition.inject ?? [],
        optionalInject: definition.optionalInject ?? [],
        gate: definition.manifest.application?.gate,
        capabilities: definition.manifest.capabilities ?? [],
      };
    });
    try {
      return JSON.stringify(entries);
    } catch {
      return entries.map((entry) => String(entry.definitionId)).join(":");
    }
  }

  #clearGateSubscriptions(): void {
    for (const cleanup of this.#gateSubscriptionCleanups.splice(0).reverse()) {
      try {
        cleanup();
      } catch {
        // Gate teardown must not retain the rest of the foundation.
      }
    }
  }

  #connectGateServices(): boolean {
    const state = this.#currentState;
    if (state === undefined) return false;
    this.#clearGateSubscriptions();
    for (const candidate of this.#foundationCandidates(state)) {
      const gate = candidate.definition.manifest.application?.gate;
      if (gate === undefined) continue;
      const activation = this.#activations.get(candidate.instance.id);
      if (activation?.status !== "active") {
        const message = activation?.status === "failed"
          ? activation.errorMessage
          : `Application Gate instance "${candidate.instance.id}" could not activate.`;
        this.#setApplicationFailure(
          {
            instanceId: candidate.instance.id,
            pluginId: candidate.instance.pluginId,
            message,
          },
          state.diagnostics,
        );
        this.#clearGateSubscriptions();
        return false;
      }
      const service = this.get<UIApplicationGateService>(gate.service);
      if (
        service === undefined ||
        typeof service.getSnapshot !== "function" ||
        typeof service.subscribe !== "function"
      ) {
        this.#setApplicationFailure(
          {
            instanceId: candidate.instance.id,
            pluginId: candidate.instance.pluginId,
            message: `Application Gate service "${gate.service}" is invalid.`,
          },
          state.diagnostics,
        );
        this.#clearGateSubscriptions();
        return false;
      }
      try {
        const cleanup = service.subscribe(() => this.#handleGateServiceChange());
        if (typeof cleanup !== "function") {
          throw new Error(`Application Gate service "${gate.service}" subscribe() must return a cleanup function.`);
        }
        this.#gateSubscriptionCleanups.push(cleanup);
      } catch (error) {
        this.#setApplicationFailure(
          {
            instanceId: candidate.instance.id,
            pluginId: candidate.instance.pluginId,
            message: toErrorMessage(error),
          },
          state.diagnostics,
        );
        this.#clearGateSubscriptions();
        return false;
      }
    }
    return true;
  }

  #handleGateServiceChange(): void {
    this.#beginMutationBatch();
    try {
      this.#synchronizeApplicationGates();
    } finally {
      this.#endMutationBatch(true);
    }
  }

  #readGateEntries():
    | { gates: ApplicationGateRuntimeEntry[] }
    | { failure: ApplicationLifecycleFailure } {
    const state = this.#currentState;
    if (state === undefined) {
      return { failure: { message: "Application lifecycle has no active model." } };
    }
    const gates: ApplicationGateRuntimeEntry[] = [];
    for (const candidate of this.#foundationCandidates(state)) {
      const gate = candidate.definition.manifest.application?.gate;
      if (gate === undefined) continue;
      const service = this.get<UIApplicationGateService>(gate.service);
      try {
        const snapshot = service?.getSnapshot();
        if (!isApplicationGateSnapshot(snapshot)) {
          throw new Error(`Application Gate service "${gate.service}" returned an invalid snapshot.`);
        }
        gates.push({
          instanceId: candidate.instance.id,
          pluginId: candidate.instance.pluginId,
          priority: gate.priority ?? 0,
          status: snapshot.status,
          ...(snapshot.message === undefined ? {} : { message: snapshot.message }),
        });
      } catch (error) {
        return {
          failure: {
            instanceId: candidate.instance.id,
            pluginId: candidate.instance.pluginId,
            message: toErrorMessage(error),
          },
        };
      }
    }
    gates.sort(
      (left, right) =>
        right.priority - left.priority || left.instanceId.localeCompare(right.instanceId),
    );
    return { gates };
  }

  #synchronizeApplicationGates(): void {
    const state = this.#currentState;
    if (state === undefined) return;
    const result = this.#readGateEntries();
    if ("failure" in result) {
      this.#deactivateStage("workspace");
      this.#setApplicationFailure(result.failure, state.diagnostics);
      return;
    }
    const errored = result.gates.find((gate) => gate.status === "error");
    if (errored !== undefined) {
      this.#deactivateStage("workspace");
      this.#setApplicationFailure(
        {
          instanceId: errored.instanceId,
          pluginId: errored.pluginId,
          message: errored.message ?? "Application Gate entered the error state.",
        },
        state.diagnostics,
        result.gates,
      );
      return;
    }

    this.#resolveGateFailures(result.gates, state.diagnostics);
    const active = result.gates.find((gate) => gate.status !== "ready");
    if (active !== undefined) {
      this.#deactivateStage("workspace");
      this.applicationLifecycle.update({
        phase: active.status === "checking" ? "resolving-gates" : "blocked",
        gates: result.gates,
        activeGateInstanceId: active.instanceId,
      });
      return;
    }

    if (!this.#workspaceReconciled) {
      this.#activateCandidates(
        this.#workspaceCandidates(state),
        "workspace",
        state.actions,
        state.diagnostics,
      );
      this.#workspaceReconciled = true;
    }
    this.applicationLifecycle.update({ phase: "ready", gates: result.gates });
  }

  #setApplicationFailure(
    failure: ApplicationLifecycleFailure,
    diagnostics: PluginDiagnosticContextValue | null | undefined,
    gates: readonly ApplicationGateRuntimeEntry[] = [],
  ): void {
    const key = failure.instanceId ?? failure.pluginId ?? "application";
    if (!this.#reportedGateFailures.has(key)) {
      diagnostics?.report({
        kind: "application-gate",
        status: "error",
        ...(failure.instanceId === undefined ? {} : { instanceId: failure.instanceId }),
        ...(failure.pluginId === undefined ? {} : { pluginId: failure.pluginId }),
        errorMessage: failure.message,
      });
      this.#reportedGateFailures.add(key);
    }
    this.applicationLifecycle.update({ phase: "error", gates, failure });
  }

  #resolveGateFailures(
    gates: readonly ApplicationGateRuntimeEntry[],
    diagnostics: PluginDiagnosticContextValue | null | undefined,
  ): void {
    const identities = new Map(gates.map((gate) => [gate.instanceId, gate]));
    for (const key of [...this.#reportedGateFailures]) {
      const gate = identities.get(key);
      diagnostics?.report({
        kind: "application-gate",
        status: "resolved",
        ...(gate === undefined ? {} : {
          instanceId: gate.instanceId,
          pluginId: gate.pluginId,
        }),
      });
      this.#reportedGateFailures.delete(key);
    }
  }

  #runCleanups(record: ActivePluginRecord): void {
    for (const cleanup of [...record.cleanups].reverse()) {
      try {
        cleanup();
      } catch {
        // Match an all-settled lifecycle: one faulty disposer must not retain
        // other services or block dependant teardown.
      }
    }
    record.cleanups.length = 0;
  }

  #emit(): void {
    this.#revision += 1;
    this.#listeners.forEach((listener) => listener());
  }

  #beginMutationBatch(): void {
    this.#mutationBatchDepth += 1;
  }

  #endMutationBatch(forceEmit = false): void {
    this.#mutationBatchDepth -= 1;
    if (this.#mutationBatchDepth !== 0) {
      return;
    }
    const shouldEmit = forceEmit || this.#serviceMutationPending;
    this.#serviceMutationPending = false;
    if (shouldEmit) {
      this.#emit();
    }
  }

  #serviceMutated(): void {
    if (this.#mutationBatchDepth > 0) {
      this.#serviceMutationPending = true;
      return;
    }
    this.#emit();
  }
}
