import { DataMessageUIRegistration } from "@agent-ui/react";

import type { AppUIRuntimeModel } from "../../framework/contracts/app-ui-runtime-model";
import type { PluginRegistry } from "./PluginRegistry";
import { usePluginServiceRuntime, usePluginServiceRuntimeRevision } from "./PluginServiceContext";
import { resolveDataMessageUIRegistrations } from "./data-message-ui-registrations";

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
