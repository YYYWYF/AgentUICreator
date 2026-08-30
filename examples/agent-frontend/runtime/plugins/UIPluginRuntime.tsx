import type { ReactNode } from "react";

import type {
  AppUIModel,
  PluginInstance,
  SlotNode,
} from "../../framework/contracts/app-ui-model";
import type {
  AGUIMessage,
  UIPluginContext,
  UIPluginRunState,
} from "../../framework/contracts/ui-plugin";
import { LayoutRenderer } from "../layout";
import type { PluginRegistry } from "./PluginRegistry";
import {
  useOptionalPluginServiceRuntime,
  usePluginServiceRuntime,
  usePluginServiceRuntimeRevision,
} from "./PluginServiceContext";
import { PluginServiceProvider } from "./PluginServiceProvider";
import {
  createInstanceActions,
  type UIPluginRuntimeActions,
} from "./PluginServiceRuntime";

import "./plugin-runtime.css";

export interface UIPluginRuntimeProps {
  model: AppUIModel;
  registry: PluginRegistry;
  messages: AGUIMessage[];
  state: unknown;
  run: UIPluginRunState;
  actions: UIPluginRuntimeActions;
  className?: string | undefined;
}

interface PluginSlotProps {
  slot: SlotNode;
  model: AppUIModel;
  registry: PluginRegistry;
  messages: AGUIMessage[];
  state: unknown;
  run: UIPluginRunState;
  actions: UIPluginRuntimeActions;
}

function PluginRuntimeError({ children }: { children: ReactNode }) {
  return (
    <div className="app-ui-plugin-error" role="alert">
      {children}
    </div>
  );
}

function PluginSlot({
  slot,
  model,
  registry,
  messages,
  state,
  run,
  actions,
}: PluginSlotProps) {
  const serviceRuntime = usePluginServiceRuntime();
  usePluginServiceRuntimeRevision();

  return (
    <div className="app-ui-plugin-slot-content">
      {slot.pluginInstanceIds.map((instanceId) => {
        const instance = model.pluginInstances[instanceId];

        if (instance === undefined) {
          return (
            <PluginRuntimeError key={instanceId}>
              Plugin instance &quot;{instanceId}&quot; does not exist.
            </PluginRuntimeError>
          );
        }

        if (!instance.enabled) {
          return null;
        }

        const definition = registry.get(instance.pluginId);

        if (definition === undefined) {
          return (
            <PluginRuntimeError key={instance.id}>
              UI plugin &quot;{instance.pluginId}&quot; is not registered.
            </PluginRuntimeError>
          );
        }

        const activation = serviceRuntime.getActivation(instance.id);
        const requiresActivation =
          definition.setup !== undefined ||
          (definition.inject?.length ?? 0) > 0;

        if (
          activation?.status === "pending" ||
          (activation === undefined && requiresActivation)
        ) {
          const missingServices =
            activation?.status === "pending"
              ? activation.missingServices
              : (definition.inject ?? []);

          return (
            <div
              className="app-ui-plugin-pending"
              data-plugin-instance-id={instance.id}
              data-plugin-state="pending"
              key={instance.id}
              role="status"
            >
              Waiting for plugin service
              {missingServices.length === 0
                ? "."
                : `: ${missingServices.join(", ")}`}
            </div>
          );
        }

        if (activation?.status === "failed") {
          return (
            <PluginRuntimeError key={instance.id}>
              UI plugin &quot;{instance.pluginId}&quot; failed to activate: {" "}
              {activation.errorMessage}
            </PluginRuntimeError>
          );
        }

        const context: UIPluginContext = {
          messages,
          state,
          run,
          instance,
          actions: createInstanceActions(instance, actions),
          services: serviceRuntime.services,
        };
        const PluginComponent = definition.Component;
        const activationKey =
          activation?.status === "active"
            ? `${instance.id}:${activation.activationId}`
            : instance.id;

        return (
          <div
            className="app-ui-plugin-instance"
            data-plugin-id={definition.manifest.id}
            data-plugin-instance-id={instance.id}
            key={activationKey}
          >
            <PluginComponent context={context} />
          </div>
        );
      })}
    </div>
  );
}

function UIPluginRuntimeContent({
  model,
  registry,
  messages,
  state,
  run,
  actions,
  className,
}: UIPluginRuntimeProps) {
  return (
    <LayoutRenderer
      className={className}
      model={model}
      renderSlot={(slot) => (
        <PluginSlot
          actions={actions}
          messages={messages}
          model={model}
          registry={registry}
          run={run}
          slot={slot}
          state={state}
        />
      )}
    />
  );
}

export function UIPluginRuntime(props: UIPluginRuntimeProps) {
  const inheritedServiceRuntime = useOptionalPluginServiceRuntime();

  if (inheritedServiceRuntime === null) {
    return (
      <PluginServiceProvider
        actions={props.actions}
        model={props.model}
        registry={props.registry}
      >
        <UIPluginRuntimeContent {...props} />
      </PluginServiceProvider>
    );
  }

  return <UIPluginRuntimeContent {...props} />;
}
