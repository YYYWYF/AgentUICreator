import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

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
import {
  PluginErrorBoundary,
  type PluginRenderFailure,
} from "./PluginErrorBoundary";
import {
  PluginDiagnosticProvider,
  useOptionalPluginDiagnosticContext,
  type RuntimeDiagnosticReporter,
} from "../diagnostics";

import "./plugin-runtime.css";

export interface UIPluginRuntimeProps {
  model: AppUIModel;
  registry: PluginRegistry;
  messages: AGUIMessage[];
  state: unknown;
  run: UIPluginRunState;
  actions: UIPluginRuntimeActions;
  className?: string | undefined;
  appUIModelHash?: string | undefined;
  onRuntimeDiagnostic?: RuntimeDiagnosticReporter | undefined;
}

interface SlotContentProps {
  slotId: string;
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

function SlotContent({
  slotId,
  model,
  registry,
  messages,
  state,
  run,
  actions,
  onPluginError,
  onPluginReset,
}: SlotContentProps) {
  const serviceRuntime = usePluginServiceRuntime();
  const slots = serviceRuntime.slots;
  const getSnapshot = useCallback(
    () => slots.getContributions(slotId),
    [slots, slotId],
  );
  const contributions = useSyncExternalStore(slots.subscribe, getSnapshot, getSnapshot);

  if (contributions.length === 0) return null;

  return (
    <div
      className="app-ui-plugin-slot-content"
      data-slot-id={slotId}
    >
      {contributions.map(({ instanceId }) => {
        const instance = model.pluginInstances[instanceId];

        if (instance === undefined) {
          return (
            <PluginRuntimeError key={instanceId}>
              Plugin instance &quot;{instanceId}&quot; does not exist.
            </PluginRuntimeError>
          );
        }

        if (!instance.enabled || instance.mount?.slotId !== slotId) {
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
        if (activation?.status !== "active") return null;

        const context: UIPluginContext = {
          messages,
          state,
          run,
          instance,
          actions: createInstanceActions(instance, actions),
          services: serviceRuntime.services,
        };
        const PluginComponent = definition.Component;
        const renderSlot = (requestedSlotId: string): ReactNode => {
          const childSlots = definition.manifest.slots?.children ?? [];
          if (!childSlots.includes(requestedSlotId)) {
            throw new Error(
              `Plugin instance "${instance.id}" cannot render undeclared child Slot "${requestedSlotId}"`,
            );
          }
          return (
            <SlotContent
              actions={actions}
              messages={messages}
              model={model}
              onPluginError={onPluginError}
              onPluginReset={onPluginReset}
              registry={registry}
              run={run}
              slotId={requestedSlotId}
              state={state}
            />
          );
        };
        const activationKey =
          definition.setup !== undefined || (definition.inject?.length ?? 0) > 0
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
              <PluginComponent context={context} renderSlot={renderSlot} />
            </div>
          </PluginErrorBoundary>
        );
      })}
    </div>
  );
}

interface LayoutSlotOutletProps extends Omit<SlotContentProps, "slotId"> {
  slot: SlotNode;
}

function LayoutSlotOutlet({ slot, ...props }: LayoutSlotOutletProps) {
  const slots = usePluginServiceRuntime().slots;
  useEffect(
    () =>
      slots.declare({
        slotId: slot.slotId,
        owner: { kind: "layout", nodeId: slot.id },
      }),
    [slot.id, slot.slotId, slots],
  );
  return <SlotContent {...props} slotId={slot.slotId} />;
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
  const diagnostics = useOptionalPluginDiagnosticContext();
  const serviceRuntime = usePluginServiceRuntime();
  usePluginServiceRuntimeRevision();
  const [pluginFailures, setPluginFailures] = useState<
    Record<string, PluginRenderFailure>
  >({});
  const reportPluginFailure = useCallback((failure: PluginRenderFailure) => {
    diagnostics?.report({
      kind: "plugin-render",
      status: "error",
      pluginId: failure.pluginId,
      pluginName: failure.pluginName,
      instanceId: failure.instanceId,
      errorMessage: failure.errorMessage,
      ...(failure.componentStack === undefined
        ? {}
        : { componentStack: failure.componentStack }),
    });
    setPluginFailures((current) => ({
      ...current,
      [failure.instanceId]: failure,
    }));
  }, [diagnostics]);
  const resolvePluginFailure = useCallback((instanceId: string) => {
    const instance = model.pluginInstances[instanceId];
    const failure = pluginFailures[instanceId];
    if (failure !== undefined) {
      diagnostics?.report({
        kind: "plugin-render",
        status: "resolved",
        pluginId: instance?.pluginId ?? failure.pluginId,
        ...(failure.pluginName === undefined
          ? {}
          : { pluginName: failure.pluginName }),
        instanceId,
      });
    }
    setPluginFailures((current) => {
      if (current[instanceId] === undefined) {
        return current;
      }

      const next = { ...current };
      delete next[instanceId];
      return next;
    });
  }, [diagnostics, model, pluginFailures]);
  const dismissPluginFailure = useCallback((instanceId: string) => {
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
    const staleFailures = Object.values(pluginFailures).filter((failure) => {
      const instance = model.pluginInstances[failure.instanceId];
      return (
        instance === undefined ||
        !instance.enabled ||
        instance.mount === undefined
      );
    });
    if (staleFailures.length === 0) {
      return;
    }
    staleFailures.forEach((failure) => {
      diagnostics?.report({
        kind: "plugin-render",
        status: "resolved",
        pluginId: failure.pluginId,
        pluginName: failure.pluginName,
        instanceId: failure.instanceId,
      });
    });
    const staleInstanceIds = new Set(
      staleFailures.map((failure) => failure.instanceId),
    );
    setPluginFailures((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([instanceId]) => !staleInstanceIds.has(instanceId),
        ),
      ),
    );
  }, [diagnostics, model, pluginFailures]);

  return (
    <>
      <LayoutRenderer
        className={className}
        model={model}
        renderSlot={(slot: SlotNode) => (
          <LayoutSlotOutlet
            actions={actions}
            messages={messages}
            model={model}
            onPluginError={reportPluginFailure}
            onPluginReset={resolvePluginFailure}
            registry={registry}
            run={run}
            slot={slot}
            state={state}
          />
        )}
      />

      {/* Activation failures have no contribution. Report them outside Slot rendering. */}
      {Object.values(model.pluginInstances).map((instance) => {
        if (!instance.enabled || instance.mount === undefined) return null;
        const definition = registry.get(instance.pluginId);
        if (definition === undefined) {
          return (
            <PluginRuntimeError key={instance.id}>
              UI plugin &quot;{instance.pluginId}&quot; is not registered.
            </PluginRuntimeError>
          );
        }
        const activation = serviceRuntime.getActivation(instance.id);
        if (activation?.status === "failed") {
          return (
            <PluginRuntimeError key={instance.id}>
              UI plugin &quot;{instance.pluginId}&quot; failed to activate: {activation.errorMessage}
            </PluginRuntimeError>
          );
        }
        if (activation?.status === "pending") {
          return (
            <div
              className="app-ui-plugin-pending"
              data-plugin-instance-id={instance.id}
              data-plugin-state="pending"
              key={instance.id}
              role="status"
            >
              Waiting for plugin service: {activation.missingServices.join(", ")}
            </div>
          );
        }
        return null;
      })}

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
                onClick={() => dismissPluginFailure(failure.instanceId)}
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
  const inheritedDiagnostics = useOptionalPluginDiagnosticContext();

  if (inheritedDiagnostics === null && props.appUIModelHash !== undefined) {
    return (
      <PluginDiagnosticProvider
        appUIModelHash={props.appUIModelHash}
        model={props.model}
        onRuntimeDiagnostic={props.onRuntimeDiagnostic}
      >
        <UIPluginRuntime {...props} appUIModelHash={undefined} />
      </PluginDiagnosticProvider>
    );
  }

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
