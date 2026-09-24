import { DataMessageUIRegistration, type DataMessageUIDefinition } from "@agent-ui/react";

import type { AppUIRuntimeModel } from "../../framework/contracts/app-ui-runtime-model";
import type { PluginRegistry } from "./PluginRegistry";
import { usePluginServiceRuntime, usePluginServiceRuntimeRevision } from "./PluginServiceContext";
import type { PluginServiceRuntime } from "./PluginServiceRuntime";

interface Registration {
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

export function resolveDataMessageUIRegistrations<TState>(
  model: AppUIRuntimeModel,
  registry: PluginRegistry<TState>,
  runtime: PluginServiceRuntime,
): Registration[] {
  const registrations: Registration[] = [];
  const byName = new Map<string, Registration>();

  for (const instance of Object.values(model.pluginInstances).sort((a, b) => a.id.localeCompare(b.id))) {
    if (!instance.enabled || runtime.getActivation(instance.id)?.status !== "active") continue;
    const definition = registry.get(instance.pluginId);
    for (const dataUI of definition?.dataMessageUIs ?? []) {
      const name = dataUI.name;
      if (name.length === 0 || name.trim() !== name) {
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

/** Mounted once under the assistant-ui runtime, independently of Layout Slots. */
export function PluginDataMessageUIHost<TState>({
  model,
  registry,
}: {
  model: AppUIRuntimeModel;
  registry: PluginRegistry<TState>;
}) {
  const runtime = usePluginServiceRuntime();
  usePluginServiceRuntimeRevision();
  const registrations = resolveDataMessageUIRegistrations(model, registry, runtime);

  return <>
    {registrations.map(({ instanceId, definition }) => (
      <DataMessageUIRegistration
        key={`${instanceId}:${definition.name}`}
        definition={definition}
      />
    ))}
  </>;
}
