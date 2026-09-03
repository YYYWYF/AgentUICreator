import type {
  AppUIModel,
  PluginInstance,
} from "../../framework/contracts/app-ui-model";
import { validateAppUIComposition } from "../../framework/contracts/app-ui-composition";
import { SlotRegistry } from "../slots/SlotRegistry";
import type {
  UIPluginActions,
  UIPluginDefinition,
  UIPluginServiceRegistrar,
  UIPluginServices,
} from "../../framework/contracts/ui-plugin";
import {
  createPluginSlotCatalog,
  type PluginRegistry,
} from "./PluginRegistry";
import type { PluginDiagnosticContextValue } from "../diagnostics";

export interface UIPluginRuntimeActions {
  sendMessage(input: string): Promise<void>;
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
  cleanups: Array<() => void>;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assertServiceName(name: string): void {
  if (name.trim().length === 0) {
    throw new Error("UI plugin service names must not be blank");
  }
}

export function createInstanceActions(
  instance: PluginInstance,
  actions: UIPluginRuntimeActions,
): UIPluginActions {
  return {
    sendMessage: actions.sendMessage,
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
 * The runtime deliberately rebuilds the activation graph when AppUIModel
 * changes. That gives provider removal/replacement the same safety property as
 * a plugin unload: dependants are deactivated, their setup cleanups run, and
 * any newly satisfied dependant receives a fresh activation id.
 */
export class PluginServiceRuntime {
  readonly slots = new SlotRegistry();
  readonly #services = new Map<string, ServiceRecord>();
  readonly #activations = new Map<string, PluginActivationState>();
  readonly #listeners = new Set<() => void>();
  readonly #activePlugins: ActivePluginRecord[] = [];
  #activationCounter = 0;
  #revision = 0;

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

  reconcile(
    model: AppUIModel,
    registry: PluginRegistry,
    actions: UIPluginRuntimeActions,
    diagnostics?: PluginDiagnosticContextValue | null,
  ): void {
    validateAppUIComposition(model, createPluginSlotCatalog(registry));

    const previouslyFailed = new Set(
      [...this.#activations]
        .filter(([, activation]) => activation.status === "failed")
        .map(([instanceId]) => instanceId),
    );
    this.#deactivateAll();

    const pending = new Map<
      string,
      { instance: PluginInstance; definition: UIPluginDefinition }
    >();

    Object.values(model.pluginInstances)
      .filter((instance) => {
        if (!instance.enabled) return false;
        const definition = registry.get(instance.pluginId);
        return (
          instance.mount !== undefined ||
          definition?.manifest.capabilities?.includes("headless") === true
        );
      })
      .sort((left, right) =>
        left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
      )
      .forEach((instance) => {
        const definition = registry.get(instance.pluginId);
        if (definition !== undefined) {
          pending.set(instance.id, { instance, definition });
        }
      });

    let madeProgress = true;
    while (pending.size > 0 && madeProgress) {
      madeProgress = false;

      for (const [instanceId, candidate] of [...pending]) {
        const missingServices = (candidate.definition.inject ?? []).filter(
          (name) => !this.#services.has(name),
        );

        if (missingServices.length > 0) {
          continue;
        }

        pending.delete(instanceId);
        this.#activate(
          candidate.instance,
          candidate.definition,
          actions,
          diagnostics,
          previouslyFailed.has(instanceId),
        );
        madeProgress = true;
      }
    }

    for (const [instanceId, candidate] of pending) {
      this.#activations.set(instanceId, {
        status: "pending",
        missingServices: (candidate.definition.inject ?? []).filter(
          (name) => !this.#services.has(name),
        ),
      });
    }

    this.#emit();
  }

  dispose(): void {
    if (
      this.#activePlugins.length === 0 &&
      this.#activations.size === 0 &&
      this.#services.size === 0
    ) {
      return;
    }

    this.#deactivateAll();
    this.#emit();
  }

  #activate(
    instance: PluginInstance,
    definition: UIPluginDefinition,
    actions: UIPluginRuntimeActions,
    diagnostics?: PluginDiagnosticContextValue | null,
    reportResolution = false,
  ): void {
    const record: ActivePluginRecord = {
      instanceId: instance.id,
      cleanups: [],
    };
    this.#activePlugins.push(record);

    const registrar: UIPluginServiceRegistrar = {
      get: <T = unknown>(name: string): T | undefined => this.get<T>(name),
      provide: <T>(name: string, value: T): (() => void) => {
        assertServiceName(name);

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
        this.#services.set(name, serviceRecord);

        let active = true;
        const disposeService = (): void => {
          if (!active) {
            return;
          }
          active = false;

          if (this.#services.get(name) === serviceRecord) {
            this.#services.delete(name);
          }
        };
        record.cleanups.push(disposeService);
        return disposeService;
      },
    };

    try {
      const cleanup = definition.setup?.({
        instance,
        actions: createInstanceActions(instance, actions),
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

      this.#activations.set(instance.id, {
        status: "active",
        activationId: ++this.#activationCounter,
      });
      if (reportResolution) {
        diagnostics?.report({
          kind: "plugin-activation",
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
        kind: "plugin-activation",
        status: "error",
        pluginId: definition.manifest.id,
        pluginName: definition.manifest.name,
        instanceId: instance.id,
        errorMessage: toErrorMessage(error),
      });
    }
  }

  #deactivateAll(): void {
    for (const record of [...this.#activePlugins].reverse()) {
      this.#runCleanups(record);
    }
    this.#activePlugins.length = 0;
    this.#services.clear();
    this.#activations.clear();
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
}
