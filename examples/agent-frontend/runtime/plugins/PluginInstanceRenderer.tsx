import { useEffect, type ReactNode } from "react";

import type { PluginInstance } from "../../framework/contracts/app-ui-model";
import type {
  UIPluginDefinition,
  UIPluginEvents,
} from "../../framework/contracts/ui-plugin";
import { PluginInstanceProvider } from "../context";
import {
  useOptionalPluginDiagnosticContext,
  type RuntimeCompositionInstance,
} from "../diagnostics";
import {
  PluginErrorBoundary,
  type PluginRenderFailure,
} from "./PluginErrorBoundary";
import { PluginServiceConsumerContext } from "./PluginServiceContext";
import {
  createInstanceActions,
  type PluginActivationState,
  type UIPluginRuntimeActions,
} from "./PluginServiceRuntime";

function createPropsResetKey(
  props: PluginInstance["props"],
): string | PluginInstance["props"] {
  try {
    return JSON.stringify(props ?? null);
  } catch {
    return props;
  }
}

function RuntimePluginMountProbe({
  children,
  instanceId,
  pluginId,
  slotId,
}: {
  children: ReactNode;
  instanceId: string;
  pluginId: string;
  slotId: string;
}) {
  const diagnostics = useOptionalPluginDiagnosticContext();
  useEffect(() => {
    if (diagnostics === null) return undefined;
    const slotPath = diagnostics?.locationFor(instanceId)?.slotPath;
    const instance: RuntimeCompositionInstance = {
      instanceId,
      pluginId,
      slotId,
      ...(slotPath === undefined ? {} : { slotPath }),
    };
    return diagnostics.registerMountedInstance(instance);
  }, [diagnostics, instanceId, pluginId, slotId]);
  return children;
}

export interface PluginInstanceRendererProps<TState = unknown> {
  instance: PluginInstance;
  definition: UIPluginDefinition<TState>;
  activation: Extract<PluginActivationState, { status: "active" }>;
  events: UIPluginEvents;
  actions: UIPluginRuntimeActions;
  renderSlot(slotId: string, fallback?: ReactNode): ReactNode;
  onPluginError(failure: PluginRenderFailure): void;
  onPluginReset(instanceId: string): void;
  mountSlotId?: string | undefined;
}

export function PluginInstanceRenderer<TState = unknown>({
  instance,
  definition,
  activation,
  events,
  actions,
  renderSlot,
  onPluginError,
  onPluginReset,
  mountSlotId,
}: PluginInstanceRendererProps<TState>) {
  const PluginComponent = definition.Component;
  const instanceActions = createInstanceActions(instance, actions);
  const activationKey =
    definition.setup !== undefined ||
    (definition.inject?.length ?? 0) > 0 ||
    definition.manifest.application?.gate !== undefined
      ? `${instance.id}:${activation.activationId}`
      : instance.id;
  const content = (
    <div
      className="app-ui-plugin-instance"
      data-plugin-id={definition.manifest.id}
      data-plugin-instance-id={instance.id}
    >
      <PluginServiceConsumerContext.Provider
        value={{
          pluginId: definition.manifest.id,
          instanceId: instance.id,
          provides: definition.provides ?? [],
          inject: definition.inject ?? [],
          optionalInject: definition.optionalInject ?? [],
        }}
      >
        <PluginInstanceProvider
          actions={instanceActions}
          events={events}
          instance={instance}
        >
          <PluginComponent renderSlot={renderSlot} />
        </PluginInstanceProvider>
      </PluginServiceConsumerContext.Provider>
    </div>
  );

  return (
    <PluginErrorBoundary
      instanceId={instance.id}
      key={activationKey}
      onError={onPluginError}
      onReset={onPluginReset}
      pluginId={definition.manifest.id}
      pluginName={definition.manifest.name}
      resetKeys={[
        PluginComponent,
        activationKey,
        instance.pluginId,
        createPropsResetKey(instance.props),
      ]}
    >
      {mountSlotId === undefined ? content : (
        <RuntimePluginMountProbe
          instanceId={instance.id}
          pluginId={definition.manifest.id}
          slotId={mountSlotId}
        >
          {content}
        </RuntimePluginMountProbe>
      )}
    </PluginErrorBoundary>
  );
}
