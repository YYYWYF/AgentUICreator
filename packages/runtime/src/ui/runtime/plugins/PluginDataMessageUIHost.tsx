import { DataMessageUIRegistration } from "../../../plugin-api/index.js";

import type { AppUIRuntimeModel } from "../../framework/contracts/app-ui-runtime-model.js";
import type { PluginRegistry } from "./PluginRegistry.js";
import { usePluginServiceRuntime, usePluginServiceRuntimeRevision } from "./PluginServiceContext.js";
import { resolveDataMessageUIRegistrations } from "./data-message-ui-registrations.js";

/** Mounted once under the Agent UI runtime, independently of Layout Slots. */
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
