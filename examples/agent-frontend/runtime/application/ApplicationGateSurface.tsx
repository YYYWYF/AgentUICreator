import type { ReactNode } from "react";

import type { AppUIModel } from "../../framework/contracts/app-ui-model";
import type { PluginRegistry } from "../plugins/PluginRegistry";
import type { PluginRenderFailure } from "../plugins/PluginErrorBoundary";
import { PluginInstanceRenderer } from "../plugins/PluginInstanceRenderer";
import { usePluginServiceRuntime } from "../plugins/PluginServiceContext";
import type { UIPluginRuntimeActions } from "../plugins/PluginServiceRuntime";
import { useApplicationLifecycle } from "./ApplicationLifecycleContext";

import "./application.css";

export interface ApplicationGateSurfaceProps<TState = unknown> {
  model: AppUIModel;
  registry: PluginRegistry<TState>;
  actions: UIPluginRuntimeActions;
  onPluginError(failure: PluginRenderFailure): void;
  onPluginReset(instanceId: string): void;
}

function ApplicationStartupFailure({
  pluginId,
  instanceId,
  message,
}: {
  pluginId?: string | undefined;
  instanceId?: string | undefined;
  message: string;
}) {
  return (
    <div className="app-ui-application-gate-failure" role="alert">
      <strong>Application startup failed</strong>
      {pluginId === undefined && instanceId === undefined ? null : (
        <span>{[pluginId, instanceId].filter(Boolean).join(" · ")}</span>
      )}
      <code>{message}</code>
    </div>
  );
}

export function ApplicationGateSurface<TState = unknown>({
  model,
  registry,
  actions,
  onPluginError,
  onPluginReset,
}: ApplicationGateSurfaceProps<TState>) {
  const lifecycle = useApplicationLifecycle();
  const serviceRuntime = usePluginServiceRuntime();

  if (lifecycle.phase === "error") {
    return (
      <main
        className="app-ui-application-gate"
        data-application-phase="error"
        tabIndex={-1}
      >
        <ApplicationStartupFailure
          instanceId={lifecycle.failure?.instanceId}
          message={lifecycle.failure?.message ?? "Unknown Application Gate error."}
          pluginId={lifecycle.failure?.pluginId}
        />
      </main>
    );
  }

  const activeGateInstanceId = lifecycle.activeGateInstanceId;
  if (activeGateInstanceId === undefined) {
    return (
      <main
        aria-busy={
          lifecycle.phase === "bootstrapping" ||
          lifecycle.phase === "resolving-gates"
        }
        className="app-ui-application-gate"
        data-application-phase={lifecycle.phase}
        tabIndex={-1}
      />
    );
  }
  const instance = model.pluginInstances[activeGateInstanceId];
  const definition = instance === undefined
    ? undefined
    : registry.get(instance.pluginId);
  const activation = serviceRuntime.getActivation(activeGateInstanceId);
  const events = serviceRuntime.getEvents(activeGateInstanceId);
  if (
    instance === undefined ||
    definition === undefined ||
    activation?.status !== "active" ||
    events === undefined
  ) {
    return (
      <main
        className="app-ui-application-gate"
        data-application-phase="error"
        tabIndex={-1}
      >
        <ApplicationStartupFailure
          instanceId={activeGateInstanceId}
          message="The active Application Gate cannot be rendered."
          pluginId={instance?.pluginId}
        />
      </main>
    );
  }

  const rejectChildSlot = (slotId: string, _fallback?: ReactNode): ReactNode => {
    throw new Error(
      `Application Gate instance "${instance.id}" cannot render child Slot "${slotId}".`,
    );
  };

  return (
    <main
      className="app-ui-application-gate"
      data-application-phase={lifecycle.phase}
      data-gate-instance-id={instance.id}
      tabIndex={-1}
    >
      <PluginInstanceRenderer
        actions={actions}
        activation={activation}
        definition={definition}
        events={events}
        instance={instance}
        onPluginError={onPluginError}
        onPluginReset={onPluginReset}
        renderSlot={rejectChildSlot}
      />
    </main>
  );
}
