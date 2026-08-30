import { useCallback, useEffect, useState, type ReactNode } from "react";

import type {
  AppUIModel,
  LayoutNode,
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
import {
  PluginErrorBoundary,
  type PluginRenderFailure,
} from "./PluginErrorBoundary";

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
  onPluginError(failure: PluginRenderFailure): void;
  onPluginReset(instanceId: string): void;
}

function PluginRuntimeError({ children }: { children: ReactNode }) {
  return (
    <div className="app-ui-plugin-error" role="alert">
      {children}
    </div>
  );
}

function createPropsResetKey(
  props: PluginInstance["props"],
): string | PluginInstance["props"] {
  try {
    return JSON.stringify(props ?? null);
  } catch {
    return props;
  }
}

function collectMountedPluginInstanceIds(
  node: LayoutNode,
  mounted: Set<string>,
): void {
  if (node.type === "slot") {
    node.pluginInstanceIds.forEach((instanceId) => mounted.add(instanceId));
    return;
  }

  if (node.type === "panel") {
    collectMountedPluginInstanceIds(node.child, mounted);
    return;
  }

  node.children.forEach((child) =>
    collectMountedPluginInstanceIds(child, mounted),
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
  onPluginError,
  onPluginReset,
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
          requiresActivation && activation?.status === "active"
            ? `${instance.id}:${activation.activationId}`
            : instance.id;

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
            <div
              className="app-ui-plugin-instance"
              data-plugin-id={definition.manifest.id}
              data-plugin-instance-id={instance.id}
            >
              <PluginComponent context={context} />
            </div>
          </PluginErrorBoundary>
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
  const [pluginFailures, setPluginFailures] = useState<
    Record<string, PluginRenderFailure>
  >({});
  const reportPluginFailure = useCallback((failure: PluginRenderFailure) => {
    setPluginFailures((current) => ({
      ...current,
      [failure.instanceId]: failure,
    }));
  }, []);
  const clearPluginFailure = useCallback((instanceId: string) => {
    setPluginFailures((current) => {
      if (current[instanceId] === undefined) {
        return current;
      }

      const next = { ...current };
      delete next[instanceId];
      return next;
    });
  }, []);
  const failures = Object.values(pluginFailures);

  useEffect(() => {
    setPluginFailures((current) => {
      const mountedInstanceIds = new Set<string>();
      collectMountedPluginInstanceIds(model.root, mountedInstanceIds);
      const staleInstanceIds = Object.keys(current).filter((instanceId) => {
        const instance = model.pluginInstances[instanceId];
        return (
          instance === undefined ||
          !instance.enabled ||
          !mountedInstanceIds.has(instanceId)
        );
      });

      if (staleInstanceIds.length === 0) {
        return current;
      }

      const next = { ...current };
      staleInstanceIds.forEach((instanceId) => delete next[instanceId]);
      return next;
    });
  }, [model]);

  return (
    <>
      <LayoutRenderer
        className={className}
        model={model}
        renderSlot={(slot) => (
          <PluginSlot
            actions={actions}
            messages={messages}
            model={model}
            onPluginError={reportPluginFailure}
            onPluginReset={clearPluginFailure}
            registry={registry}
            run={run}
            slot={slot}
            state={state}
          />
        )}
      />

      {failures.length > 0 ? (
        <section
          aria-label="插件错误通知"
          aria-live="polite"
          className="app-ui-plugin-notifications"
        >
          {failures.map((failure) => (
            <div
              className="app-ui-plugin-error app-ui-plugin-notification"
              data-plugin-id={failure.pluginId}
              data-plugin-instance-id={failure.instanceId}
              data-plugin-state="error"
              key={failure.instanceId}
              role="alert"
            >
              <span className="app-ui-plugin-error-icon" aria-hidden="true">
                !
              </span>
              <span className="app-ui-plugin-error-body">
                <strong>插件运行失败</strong>
                <span className="app-ui-plugin-error-identity">
                  {failure.pluginName} · {failure.instanceId}
                </span>
                <code>{failure.errorMessage}</code>
              </span>
              <button
                aria-label={`关闭 ${failure.pluginName} 错误提示`}
                className="app-ui-plugin-notification-close"
                onClick={() => clearPluginFailure(failure.instanceId)}
                type="button"
              >
                ×
              </button>
            </div>
          ))}
        </section>
      ) : null}
    </>
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
