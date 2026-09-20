import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  LayoutRenderer,
  type SlotNode,
} from "@agent-ui/runtime-react";

import type { AppUIRuntimeModel } from "../../framework/contracts/app-ui-runtime-model";
import { resolveRuntimePluginSlotId } from "../../framework/contracts/app-ui-composition";
import type { UIPluginRenderScope, UIPluginRenderSlotOptions } from "../../framework/contracts/ui-plugin";
import {
  classifyContainerWidth,
  type RuntimeWidthClass,
} from "../diagnostics/width-compatibility";
import type { PluginRegistry } from "./PluginRegistry";
import {
  useOptionalPluginServiceRuntime,
  usePluginServiceRuntime,
  usePluginServiceRuntimeRevision,
} from "./PluginServiceContext";
import { PluginServiceProvider } from "./PluginServiceProvider";
import { type UIPluginRuntimeActions } from "./PluginServiceRuntime";
import { type PluginRenderFailure } from "./PluginErrorBoundary";
import {
  PluginDiagnosticProvider,
  useOptionalPluginDiagnosticContext,
  type RuntimeCompositionReporter,
  type RuntimeDiagnosticReporter,
} from "../diagnostics";
import type {
  AppEventRegistry,
  ApplicationEventSource,
} from "../events";
import { ApplicationGateSurface } from "../application/ApplicationGateSurface";
import {
  ApplicationLifecycleProvider,
  useApplicationLifecycle,
  useOptionalApplicationLifecycleRuntime,
} from "../application/ApplicationLifecycleContext";
import { PluginInstanceRenderer } from "./PluginInstanceRenderer";
import { PluginRenderScopeProvider } from "./PluginRenderScope";

import "./plugin-runtime.css";

export interface UIPluginRuntimeProps<TState = unknown> {
  model: AppUIRuntimeModel;
  registry: PluginRegistry<TState>;
  actions: UIPluginRuntimeActions;
  applicationEventRegistry?: AppEventRegistry | undefined;
  applicationEventSource?: ApplicationEventSource | undefined;
  className?: string | undefined;
  appUIModelHash?: string | undefined;
  onRuntimeComposition?: RuntimeCompositionReporter | undefined;
  onRuntimeDiagnostic?: RuntimeDiagnosticReporter | undefined;
}

interface SlotContentProps<TState = unknown> {
  slotId: string;
  fallback?: ReactNode | undefined;
  layout: "stack" | "inline";
  scope?: UIPluginRenderScope | undefined;
  acceptedCapabilities?: readonly string[] | undefined;
  model: AppUIRuntimeModel;
  registry: PluginRegistry<TState>;
  actions: UIPluginRuntimeActions;
  onPluginError(failure: PluginRenderFailure): void;
  onPluginReset(instanceId: string): void;
}

interface SlotWidthProbeProps {
  children: ReactNode;
  layout: "stack" | "inline";
  sizing: "fill" | "content";
  slotId: string;
}

export function resolveSlotRenderOptions(
  options: UIPluginRenderSlotOptions | undefined,
): { layout: "stack" | "inline"; sizing: "fill" | "content" } {
  const layout = options?.layout ?? "stack";
  const sizing = options?.sizing ?? "content";
  if (layout === "inline" && sizing === "fill") {
    throw new Error("inline Slot cannot use fill sizing");
  }
  return { layout, sizing };
}

function PluginRuntimeError({ children }: { children: ReactNode }) {
  return (
    <div className="app-ui-plugin-error" role="alert">
      {children}
    </div>
  );
}

function SlotWidthProbe({
  children,
  layout,
  sizing,
  slotId,
}: SlotWidthProbeProps) {
  const diagnostics = useOptionalPluginDiagnosticContext();
  const elementRef = useRef<HTMLDivElement>(null);
  const [widthClass, setWidthClass] = useState<RuntimeWidthClass>("unknown");

  useEffect(() => {
    const element = elementRef.current;
    if (element === null || typeof ResizeObserver === "undefined") return;
    const update = (width: number) => {
      setWidthClass(classifyContainerWidth(width));
    };
    update(element.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry !== undefined) update(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (diagnostics === null) return undefined;
    const slotPath = diagnostics.slotPathFor(slotId);
    return diagnostics.registerObservedSlot({
      slotId,
      widthClass,
      ...(slotPath === undefined ? {} : { slotPath }),
    });
  }, [diagnostics, slotId, widthClass]);

  return (
    <div
      ref={elementRef}
      className="app-ui-plugin-slot-width-probe"
      data-slot-id={slotId}
      data-slot-layout={layout}
      data-slot-sizing={sizing}
      data-slot-width-class={widthClass}
    >
      {children}
    </div>
  );
}

function SlotContent<TState = unknown>({
  slotId,
  fallback,
  layout,
  scope,
  acceptedCapabilities,
  model,
  registry,
  actions,
  onPluginError,
  onPluginReset,
}: SlotContentProps<TState>) {
  const serviceRuntime = usePluginServiceRuntime();
  const slots = serviceRuntime.slots;
  const getSnapshot = useCallback(
    () => slots.getContributions(slotId),
    [slots, slotId],
  );
  const contributions = useSyncExternalStore(slots.subscribe, getSnapshot, getSnapshot);

  const scopedContribution = contributions.length === 1 ? contributions[0] : undefined;
  const scopedInstance = scopedContribution === undefined
    ? undefined
    : model.pluginInstances[scopedContribution.instanceId];
  const scopedDefinition = scopedInstance === undefined
    ? undefined
    : registry.get(scopedInstance.pluginId);
  const scopedActivation = scopedInstance === undefined
    ? undefined
    : serviceRuntime.getActivation(scopedInstance.id);
  const scopedEvents = scopedInstance === undefined
    ? undefined
    : serviceRuntime.getEvents(scopedInstance.id);
  const scopedCapabilityMismatch = acceptedCapabilities !== undefined &&
    scopedDefinition !== undefined &&
    !scopedDefinition.manifest.capabilities?.some((capability) =>
      acceptedCapabilities.includes(capability),
    );

  if (scope !== undefined) {
    const instance = scopedInstance;
    const definition = scopedDefinition;
    const activation = scopedActivation;
    const events = scopedEvents;
    if (
      instance === undefined || !instance.enabled || instance.mount?.slotId !== slotId ||
      definition === undefined || activation?.status !== "active" || events === undefined ||
      scopedCapabilityMismatch
    ) return null;

    const renderChildSlot = (
      requestedSlotId: string,
      requestedFallback?: ReactNode,
      options?: UIPluginRenderSlotOptions,
    ): ReactNode => {
      const child = definition.manifest.slots?.children?.[requestedSlotId];
      if (child === undefined || child.mode === "renderer") {
        throw new Error(`Plugin instance "${instance.id}" cannot render content Slot "${requestedSlotId}"`);
      }
      const resolvedOptions = resolveSlotRenderOptions(options);
      const runtimeSlotId = resolveRuntimePluginSlotId(instance.id, requestedSlotId);
      return (
        <SlotWidthProbe {...resolvedOptions} slotId={runtimeSlotId}>
          <SlotContent actions={actions} fallback={requestedFallback} layout={resolvedOptions.layout} model={model}
            onPluginError={onPluginError} onPluginReset={onPluginReset}
            registry={registry} slotId={runtimeSlotId} />
        </SlotWidthProbe>
      );
    };
    const renderChildScopedSlot = (
      requestedSlotId: string,
      requestedScope: UIPluginRenderScope,
    ): ReactNode => {
      const child = definition.manifest.slots?.children?.[requestedSlotId];
      if (child?.mode !== "renderer") {
        throw new Error(`Plugin instance "${instance.id}" cannot render scoped Slot "${requestedSlotId}"`);
      }
      return <SlotContent actions={actions} acceptedCapabilities={child.accepts?.anyOfCapabilities}
        layout="stack" model={model} onPluginError={onPluginError}
        onPluginReset={onPluginReset} registry={registry}
        scope={requestedScope} slotId={resolveRuntimePluginSlotId(instance.id, requestedSlotId)} />;
    };
    return (
      <PluginRenderScopeProvider scope={scope}>
        <PluginInstanceRenderer actions={actions} activation={activation} definition={definition}
          events={events} instance={instance} mountSlotId={slotId}
          onPluginError={onPluginError} onPluginReset={onPluginReset}
          scoped
          renderSlot={renderChildSlot} renderScopedSlot={renderChildScopedSlot} />
      </PluginRenderScopeProvider>
    );
  }

  if (contributions.length === 0) return fallback ?? null;

  return (
    <div
      className="app-ui-plugin-slot-content"
      data-slot-id={slotId}
      data-slot-layout={layout}
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
        const events = serviceRuntime.getEvents(instance.id);
        if (events === undefined) return null;

        const renderSlot = (
          requestedSlotId: string,
          requestedFallback?: ReactNode,
          options?: UIPluginRenderSlotOptions,
        ): ReactNode => {
          const childSlots = definition.manifest.slots?.children ?? {};
          if (childSlots[requestedSlotId] === undefined || childSlots[requestedSlotId]?.mode === "renderer") {
            throw new Error(
              `Plugin instance "${instance.id}" cannot render undeclared child Slot "${requestedSlotId}"`,
            );
          }
          const resolvedOptions = resolveSlotRenderOptions(options);
          const runtimeSlotId = resolveRuntimePluginSlotId(
            instance.id,
            requestedSlotId,
          );
          return (
            <SlotWidthProbe
              {...resolvedOptions}
              slotId={runtimeSlotId}
            >
              <SlotContent
                actions={actions}
                fallback={requestedFallback}
                layout={resolvedOptions.layout}
                model={model}
                onPluginError={onPluginError}
                onPluginReset={onPluginReset}
                registry={registry}
                slotId={runtimeSlotId}
              />
            </SlotWidthProbe>
          );
        };
        const renderScopedSlot = (
          requestedSlotId: string,
          requestedScope: UIPluginRenderScope,
        ): ReactNode => {
          const child = definition.manifest.slots?.children?.[requestedSlotId];
          if (child?.mode !== "renderer") {
            throw new Error(`Plugin instance "${instance.id}" cannot render scoped Slot "${requestedSlotId}"`);
          }
          return (
            <SlotContent actions={actions} acceptedCapabilities={child.accepts?.anyOfCapabilities}
              layout="stack" model={model} onPluginError={onPluginError}
              onPluginReset={onPluginReset} registry={registry}
              scope={requestedScope} slotId={resolveRuntimePluginSlotId(instance.id, requestedSlotId)} />
          );
        };
        return (
          <PluginInstanceRenderer
            actions={actions}
            activation={activation}
            definition={definition}
            events={events}
            instance={instance}
            key={instance.id}
            mountSlotId={slotId}
            onPluginError={onPluginError}
            onPluginReset={onPluginReset}
            renderSlot={renderSlot}
            renderScopedSlot={renderScopedSlot}
          />
        );
      })}
    </div>
  );
}

interface LayoutSlotOutletProps<TState = unknown>
  extends Omit<SlotContentProps<TState>, "layout" | "slotId"> {
  slot: SlotNode;
}

function LayoutSlotOutlet<TState = unknown>({
  slot,
  ...props
}: LayoutSlotOutletProps<TState>) {
  const slots = usePluginServiceRuntime().slots;
  useEffect(
    () =>
      slots.declare({
        slotId: slot.slotId,
        owner: { kind: "layout", nodeId: slot.id },
      }),
    [slot.id, slot.slotId, slots],
  );
  return (
    <SlotWidthProbe
      layout="stack"
      sizing="fill"
      slotId={slot.slotId}
    >
      <SlotContent {...props} layout="stack" slotId={slot.slotId} />
    </SlotWidthProbe>
  );
}

function UIPluginRuntimeContent<TState = unknown>({
  model,
  registry,
  actions,
  className,
}: UIPluginRuntimeProps<TState>) {
  const diagnostics = useOptionalPluginDiagnosticContext();
  const serviceRuntime = usePluginServiceRuntime();
  usePluginServiceRuntimeRevision();
  const application = useApplicationLifecycle();
  useLayoutEffect(() => {
    diagnostics?.updateApplicationLifecycle({
      phase: application.phase,
      ...(application.activeGateInstanceId === undefined
        ? {}
        : { activeGateInstanceId: application.activeGateInstanceId }),
    });
  }, [
    application.activeGateInstanceId,
    application.phase,
    diagnostics,
  ]);
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
  }, [diagnostics, model, pluginFailures, registry]);
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
        (instance.mount === undefined &&
          registry.get(instance.pluginId)?.manifest.application?.gate ===
            undefined)
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

  const applicationSurface = application.phase === "ready" ? (
    <LayoutRenderer
      className={className}
      root={model.root}
      renderSlot={(slot: SlotNode) => (
        <LayoutSlotOutlet
          actions={actions}
          model={model}
          onPluginError={reportPluginFailure}
          onPluginReset={resolvePluginFailure}
          registry={registry}
          slot={slot}
        />
      )}
    />
  ) : (
    <ApplicationGateSurface
      actions={actions}
      model={model}
      onPluginError={reportPluginFailure}
      onPluginReset={resolvePluginFailure}
      registry={registry}
    />
  );

  return (
    <>
      {applicationSurface}

      {/* Activation failures have no contribution. Report them outside Slot rendering. */}
      {Object.values(model.pluginInstances).map((instance) => {
        if (
          application.phase !== "ready" ||
          !instance.enabled ||
          instance.mount === undefined
        ) return null;
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

export function UIPluginRuntime<TState = unknown>(
  props: UIPluginRuntimeProps<TState>,
) {
  const inheritedServiceRuntime = useOptionalPluginServiceRuntime();
  const inheritedDiagnostics = useOptionalPluginDiagnosticContext();
  const inheritedApplicationLifecycle =
    useOptionalApplicationLifecycleRuntime();

  if (inheritedDiagnostics === null && props.appUIModelHash !== undefined) {
    return (
      <PluginDiagnosticProvider
        appUIModelHash={props.appUIModelHash}
        model={props.model}
        onRuntimeComposition={props.onRuntimeComposition}
        onRuntimeDiagnostic={props.onRuntimeDiagnostic}
        registry={props.registry}
      >
        <UIPluginRuntime {...props} appUIModelHash={undefined} />
      </PluginDiagnosticProvider>
    );
  }

  if (inheritedServiceRuntime === null) {
    return (
      <PluginServiceProvider
        actions={props.actions}
        applicationEventRegistry={props.applicationEventRegistry}
        applicationEventSource={props.applicationEventSource}
        model={props.model}
        registry={props.registry}
      >
        <UIPluginRuntimeContent {...props} />
      </PluginServiceProvider>
    );
  }

  if (inheritedApplicationLifecycle === null) {
    return (
      <ApplicationLifecycleProvider
        runtime={inheritedServiceRuntime.applicationLifecycle}
      >
        <UIPluginRuntimeContent {...props} />
      </ApplicationLifecycleProvider>
    );
  }

  return <UIPluginRuntimeContent {...props} />;
}
