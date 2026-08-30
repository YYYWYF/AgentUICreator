import type { ReactNode } from "react";

import type {
  AppUIModel,
  PluginInstance,
  SlotNode,
} from "../../framework/contracts/app-ui-model";
import type {
  AGUIMessage,
  UIPluginActions,
  UIPluginContext,
} from "../../framework/contracts/ui-plugin";
import { LayoutRenderer } from "../layout";
import type { PluginRegistry } from "./PluginRegistry";

import "./plugin-runtime.css";

export interface UIPluginRuntimeActions {
  sendMessage(input: string): Promise<void>;
  updateInstanceProps(
    instanceId: string,
    props: Record<string, unknown>,
  ): void;
}

export interface UIPluginRuntimeProps {
  model: AppUIModel;
  registry: PluginRegistry;
  messages: AGUIMessage[];
  state: unknown;
  actions: UIPluginRuntimeActions;
  className?: string | undefined;
}

interface PluginSlotProps {
  slot: SlotNode;
  model: AppUIModel;
  registry: PluginRegistry;
  messages: AGUIMessage[];
  state: unknown;
  actions: UIPluginRuntimeActions;
}

function PluginRuntimeError({ children }: { children: ReactNode }) {
  return (
    <div className="app-ui-plugin-error" role="alert">
      {children}
    </div>
  );
}

function createInstanceActions(
  instance: PluginInstance,
  actions: UIPluginRuntimeActions,
): UIPluginActions {
  return {
    sendMessage: actions.sendMessage,
    updateInstanceProps: (props) => {
      actions.updateInstanceProps(instance.id, props);
    },
  };
}

function PluginSlot({
  slot,
  model,
  registry,
  messages,
  state,
  actions,
}: PluginSlotProps) {
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

        const context: UIPluginContext = {
          messages,
          state,
          instance,
          actions: createInstanceActions(instance, actions),
        };
        const PluginComponent = definition.Component;

        return (
          <div
            className="app-ui-plugin-instance"
            data-plugin-id={definition.manifest.id}
            data-plugin-instance-id={instance.id}
            key={instance.id}
          >
            <PluginComponent context={context} />
          </div>
        );
      })}
    </div>
  );
}

export function UIPluginRuntime({
  model,
  registry,
  messages,
  state,
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
          slot={slot}
          state={state}
        />
      )}
    />
  );
}
