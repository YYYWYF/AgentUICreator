import type {
  AgentApplicationEvent,
  AgentApplicationEventListener,
} from "@agent-ui/runtime-core";

import type { UIPluginEvents } from "../../framework/contracts/ui-plugin";
import type { RuntimeDiagnosticEvent } from "../diagnostics";
import { AppEventRegistry } from "./AppEventRegistry";

export interface ApplicationEventSource {
  subscribeApplicationEvents(listener: AgentApplicationEventListener): () => void;
}

type AppEventDiagnosticReporter = (
  diagnostic: RuntimeDiagnosticEvent,
) => void;

interface PluginEventScopeIdentity {
  pluginId: string;
  instanceId: string;
  declaredEventNames: readonly string[];
}

interface ListenerRecord {
  pluginId: string;
  instanceId: string;
  listener: (
    event: AgentApplicationEvent,
  ) => void | Promise<void>;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class AppEventRuntime {
  readonly #registry: AppEventRegistry;
  readonly #listeners = new Map<string, Set<ListenerRecord>>();
  #unsubscribeFromSource: (() => void) | undefined;
  #diagnosticReporter: AppEventDiagnosticReporter | undefined;
  #disposed = false;

  constructor(registry: AppEventRegistry) {
    this.#registry = registry;
  }

  connect(source: ApplicationEventSource): () => void {
    if (this.#disposed) {
      return () => undefined;
    }
    this.#unsubscribeFromSource?.();
    const unsubscribe = source.subscribeApplicationEvents(
      (event) => this.#receive(event),
    );
    this.#unsubscribeFromSource = unsubscribe;
    return () => {
      if (this.#unsubscribeFromSource === unsubscribe) {
        this.#unsubscribeFromSource = undefined;
        unsubscribe();
      }
    };
  }

  setDiagnosticReporter(
    reporter: AppEventDiagnosticReporter | undefined,
  ): () => void {
    this.#diagnosticReporter = reporter;
    return () => {
      if (this.#diagnosticReporter === reporter) {
        this.#diagnosticReporter = undefined;
      }
    };
  }

  createPluginEvents({
    pluginId,
    instanceId,
    declaredEventNames,
  }: PluginEventScopeIdentity): UIPluginEvents & { dispose(): void } {
    const unknownName = declaredEventNames.find(
      (name) => !this.#registry.has(name),
    );
    if (unknownName !== undefined) {
      throw new Error(
        `Unknown application event declaration "${unknownName}" in plugin "${pluginId}"`,
      );
    }

    const declaredNames = new Set(declaredEventNames);
    const subscriptions = new Set<() => void>();
    let active = true;

    const dispose = (): void => {
      if (!active) return;
      active = false;
      for (const unsubscribe of [...subscriptions]) {
        unsubscribe();
      }
      subscriptions.clear();
    };

    return {
      subscribe: <TPayload = unknown>(
        name: string,
        listener: (
          event: AgentApplicationEvent<TPayload>,
        ) => void | Promise<void>,
      ): (() => void) => {
        if (!active) {
          return () => undefined;
        }
        if (!declaredNames.has(name)) {
          this.#report({
            kind: "plugin-event-undeclared-subscription",
            status: "error",
            eventName: name,
            pluginId,
            instanceId,
            errorMessage:
              `Plugin "${pluginId}" did not declare application event "${name}"`,
          });
          return () => undefined;
        }

        const record: ListenerRecord = {
          pluginId,
          instanceId,
          listener: listener as ListenerRecord["listener"],
        };
        const listeners = this.#listeners.get(name) ?? new Set();
        listeners.add(record);
        this.#listeners.set(name, listeners);

        let subscribed = true;
        const unsubscribe = (): void => {
          if (!subscribed) return;
          subscribed = false;
          listeners.delete(record);
          subscriptions.delete(unsubscribe);
          if (listeners.size === 0) {
            this.#listeners.delete(name);
          }
        };
        subscriptions.add(unsubscribe);
        return unsubscribe;
      },
      dispose,
    };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#unsubscribeFromSource?.();
    this.#unsubscribeFromSource = undefined;
    this.#listeners.clear();
    this.#diagnosticReporter = undefined;
  }

  #receive(event: AgentApplicationEvent): void {
    if (this.#disposed) return;
    const decoded = this.#registry.decode(event);
    if (!decoded.ok) {
      this.#report({
        kind: decoded.reason === "unknown-event"
          ? "application-event-unknown"
          : "application-event-invalid-payload",
        status: "error",
        eventName: decoded.eventName,
        ...(decoded.issuePaths === undefined
          ? {}
          : { issuePaths: decoded.issuePaths }),
        errorMessage: decoded.reason === "unknown-event"
          ? `Unknown application event "${decoded.eventName}"`
          : `Invalid payload for application event "${decoded.eventName}"`,
      });
      return;
    }

    const listeners = this.#listeners.get(decoded.event.name);
    if (listeners === undefined) return;
    for (const record of [...listeners]) {
      try {
        const listenerEvent: AgentApplicationEvent = {
          name: decoded.event.name,
          payload: structuredClone(decoded.event.payload),
          producer: decoded.event.producer,
        };
        void Promise.resolve(record.listener(listenerEvent)).catch((error) => {
          this.#reportHandlerError(decoded.event.name, record, error);
        });
      } catch (error) {
        this.#reportHandlerError(decoded.event.name, record, error);
      }
    }
  }

  #reportHandlerError(
    eventName: string,
    record: ListenerRecord,
    error: unknown,
  ): void {
    this.#report({
      kind: "plugin-event-handler-error",
      status: "error",
      eventName,
      pluginId: record.pluginId,
      instanceId: record.instanceId,
      errorMessage: toErrorMessage(error),
    });
  }

  #report(diagnostic: RuntimeDiagnosticEvent): void {
    try {
      this.#diagnosticReporter?.(diagnostic);
    } catch {
      // Development diagnostics must never affect the Agent event stream.
    }
  }
}
