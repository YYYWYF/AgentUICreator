import type { DataMessageUIDefinition } from "@agent-ui/react";

import type { AppUIRuntimeModel } from "../../framework/contracts/app-ui-runtime-model";
import type { PluginRegistry } from "./PluginRegistry";
import type { PluginServiceRuntime } from "./PluginServiceRuntime";

export interface DataMessageUIRegistration {
  instanceId: string;
  pluginId: string;
  definition: DataMessageUIDefinition<never>;
}

export class DataMessageUIRegistrationError extends Error {
  readonly code: "DATA_MESSAGE_UI_INVALID_NAME" | "DATA_MESSAGE_UI_NAME_CONFLICT";

  constructor(
    code: DataMessageUIRegistrationError["code"],
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "DataMessageUIRegistrationError";
    this.code = code;
  }
}

function collectRegistrations<TState>(
  model: AppUIRuntimeModel,
  registry: PluginRegistry<TState>,
  include: (instanceId: string) => boolean,
): DataMessageUIRegistration[] {
  const registrations: DataMessageUIRegistration[] = [];
  const byName = new Map<string, DataMessageUIRegistration>();

  for (const instance of Object.values(model.pluginInstances).sort((a, b) => a.id.localeCompare(b.id))) {
    if (!instance.enabled || !include(instance.id)) continue;
    const definition = registry.get(instance.pluginId);
    for (const dataUI of definition?.dataMessageUIs ?? []) {
      const name = dataUI.name;
      if (typeof name !== "string" || name.length === 0 || name.trim() !== name) {
        throw new DataMessageUIRegistrationError(
          "DATA_MESSAGE_UI_INVALID_NAME",
          `Data Message UI name ${JSON.stringify(name)} in plugin "${instance.pluginId}" instance "${instance.id}" must be nonempty and trimmed.`,
        );
      }
      const conflict = byName.get(name);
      if (conflict !== undefined) {
        throw new DataMessageUIRegistrationError(
          "DATA_MESSAGE_UI_NAME_CONFLICT",
          `Data Message UI name "${name}" in plugin "${instance.pluginId}" instance "${instance.id}" conflicts with plugin "${conflict.pluginId}" instance "${conflict.instanceId}".`,
        );
      }
      const registration = { instanceId: instance.id, pluginId: instance.pluginId, definition: dataUI };
      byName.set(name, registration);
      registrations.push(registration);
    }
  }
  return registrations;
}

/** Validate every enabled instance before a composition can be published. */
export function validateDataMessageUIDefinitions<TState>(
  model: AppUIRuntimeModel,
  registry: PluginRegistry<TState>,
): void {
  collectRegistrations(model, registry, () => true);
}

/** Select active registrations; repeated checks defend the published invariant. */
export function resolveDataMessageUIRegistrations<TState>(
  model: AppUIRuntimeModel,
  registry: PluginRegistry<TState>,
  runtime: PluginServiceRuntime,
): DataMessageUIRegistration[] {
  return collectRegistrations(
    model,
    registry,
    (instanceId) => runtime.getActivation(instanceId)?.status === "active",
  );
}
