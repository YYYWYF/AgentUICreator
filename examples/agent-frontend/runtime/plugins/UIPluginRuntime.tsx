import { useCallback, useEffect, useState, type ReactNode } from "react";

import type {
  AppUIModel,
  PluginInstance,
  SlotNode,
  UISlot,
  UISlotOccupant,
} from "../../framework/contracts/app-ui-model";
import type {
  AGUIMessage,
  UIPluginDefinition,
  UIPluginContext,
  UIPluginRunState,
  UIPluginSlotRenderOptions,
} from "../../framework/contracts/ui-plugin";
import { assertUIPluginSlotContract } from "../../framework/contracts/ui-plugin";
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

interface PluginSlotProps {
  slot: UISlot;
  model: AppUIModel;
  registry: PluginRegistry;
  messages: AGUIMessage[];
  state: unknown;
  run: UIPluginRunState;
  actions: UIPluginRuntimeActions;
  ownerProps?: object | undefined;
  options?: UIPluginSlotRenderOptions | undefined;
  ancestors?: ReadonlySet<string> | undefined;
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

function collectMountedPluginInstanceIds(model: AppUIModel): Set<string> {
  return new Set(
    Object.values(model.slots).flatMap((slot) =>
      slot.occupants.map((occupant) => occupant.instanceId),
    ),
  );
}

function orderedOccupants(slot: UISlot): UISlotOccupant[] {
  if (slot.kind !== "list" && slot.kind !== "chain") {
    return [...slot.occupants];
  }
  return slot.occupants
    .map((occupant, index) => ({ occupant, index }))
    .sort(
      (left, right) =>
        (left.occupant.order ?? 0) - (right.occupant.order ?? 0) ||
        left.index - right.index,
    )
    .map(({ occupant }) => occupant);
}

function declaredChildSlot(
  model: AppUIModel,
  instanceId: string,
  outlet: string,
): UISlot | undefined {
  return Object.values(model.slots).find(
    (slot) =>
      slot.owner.type === "plugin-instance" &&
      slot.owner.instanceId === instanceId &&
      slot.owner.outlet === outlet,
  );
}

function assertOwnerProps(slot: UISlot, ownerProps: object): void {
  const contracts = slot.ownerProps ?? [];
  const values = ownerProps as Record<string, unknown>;
  const declaredNames = new Set(contracts.map((contract) => contract.name));
  const unexpected = Object.keys(values).filter((name) => !declaredNames.has(name));
  if (unexpected.length > 0) {
    throw new Error(
      `Slot "${slot.id}" received undeclared owner props: ${unexpected.join(", ")}.`,
    );
  }
  for (const contract of contracts) {
    const value = values[contract.name];
    if (contract.required && value === undefined) {
      throw new Error(
        `Slot "${slot.id}" requires owner prop "${contract.name}".`,
      );
    }
    if (value === undefined) continue;
    const matches = contract.type === "array"
      ? Array.isArray(value)
      : contract.type === "object"
        ? typeof value === "object" && value !== null && !Array.isArray(value)
        : !["string", "number", "boolean"].includes(contract.type) ||
          typeof value === contract.type;
    if (!matches) {
      throw new Error(
        `Slot "${slot.id}" owner prop "${contract.name}" must be ${contract.type}.`,
      );
    }
  }
}

function PluginSlot({
  slot,
  model,
  registry,
  messages,
  state,
  run,
  actions,
  ownerProps = {},
  options,
  ancestors = new Set(),
  onPluginError,
  onPluginReset,
}: PluginSlotProps) {
  const serviceRuntime = usePluginServiceRuntime();
  usePluginServiceRuntimeRevision();

  if (ancestors.has(slot.id)) {
    return (
      <PluginRuntimeError>
        Slot ownership cycle reached &quot;{slot.id}&quot;.
      </PluginRuntimeError>
    );
  }

  const nextAncestors = new Set(ancestors);
  nextAncestors.add(slot.id);
  assertOwnerProps(slot, ownerProps);
  if (slot.kind === "keyed" && options?.key === undefined) {
    throw new Error(`Keyed Slot "${slot.id}" requires a render key.`);
  }
  if (slot.kind !== "keyed" && options?.key !== undefined) {
    throw new Error(`Only keyed Slot "${slot.id}" may receive a render key.`);
  }
  const candidates = orderedOccupants(slot).filter((occupant) => {
    const instance = model.pluginInstances[occupant.instanceId];
    if (instance?.enabled !== true) return false;
    return slot.kind === "keyed" ? occupant.key === options?.key : true;
  });
  const selected = slot.kind === "chain"
    ? candidates.flatMap((occupant) => {
        const instance = model.pluginInstances[occupant.instanceId];
        const definition = instance === undefined
          ? undefined
          : registry.get(instance.pluginId);
        if (definition !== undefined && definition.selectSlot === undefined) {
          throw new Error(
            `UI plugin "${definition.manifest.id}" must define selectSlot when mounted in chain Slot "${slot.id}".`,
          );
        }
        if (definition === undefined) return [];
        const matched = definition.selectSlot!(ownerProps);
        return matched === null ? [] : [{ occupant, matched }];
      }).slice(0, 1)
    : candidates.map((occupant) => ({ occupant, matched: undefined }));

  if (selected.length === 0) {
    return slot.fallback === "owner" ? (options?.fallback ?? null) : null;
  }

  return (
    <div
      className="app-ui-plugin-slot-content"
      data-slot-id={slot.id}
      data-slot-kind={slot.kind}
      data-slot-scope={slot.scope}
    >
      {selected.map(({ occupant, matched }) => {
        const instanceId = occupant.instanceId;
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
          slot: {
            id: slot.id,
            kind: slot.kind,
            scope: slot.scope,
            ownerProps,
            occupant,
            ...(matched === undefined ? {} : { matched }),
          },
          slots: {
            render: (outlet, childOwnerProps = {}, childOptions) => {
              const childSlot = declaredChildSlot(model, instance.id, outlet);
              if (childSlot === undefined) {
                throw new Error(
                  `Plugin instance "${instance.id}" has no configured child Slot for outlet "${outlet}".`,
                );
              }
              assertUIPluginSlotContract(childSlot, outlet, definition);
              return (
                <PluginSlot
                  actions={actions}
                  ancestors={nextAncestors}
                  messages={messages}
                  model={model}
                  onPluginError={onPluginError}
                  onPluginReset={onPluginReset}
                  options={childOptions}
                  ownerProps={childOwnerProps}
                  registry={registry}
                  run={run}
                  slot={childSlot}
                  state={state}
                />
              );
            },
          },
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
  const diagnostics = useOptionalPluginDiagnosticContext();
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
    const mountedInstanceIds = collectMountedPluginInstanceIds(model);
    const staleFailures = Object.values(pluginFailures).filter((failure) => {
      const instance = model.pluginInstances[failure.instanceId];
      return (
        instance === undefined ||
        !instance.enabled ||
        !mountedInstanceIds.has(failure.instanceId)
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
        renderSlot={(slotNode: SlotNode) => {
          const slot = model.slots[slotNode.slotId];
          return slot === undefined ? (
            <PluginRuntimeError>
              Slot &quot;{slotNode.slotId}&quot; does not exist.
            </PluginRuntimeError>
          ) : (
            <PluginSlot
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
          );
        }}
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
