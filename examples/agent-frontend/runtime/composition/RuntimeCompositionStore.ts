import {
  collectAppUIPluginLocations,
  parseAppUIModelJson,
  type AppUIModel,
} from "../../framework/contracts/app-ui-model";
import { compileAppUIModel } from "../../framework/contracts/app-ui-compiler";
import type { AppUIRuntimeModel } from "../../framework/contracts/app-ui-runtime-model";
import type { PluginCompositionCatalog } from "../../framework/contracts/app-ui-composition";
import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";
import { sha256Text } from "../diagnostics/app-ui-model-hash";
import {
  createPluginCompositionCatalog,
  createPluginRegistry,
  type PluginRegistry,
} from "../plugins/PluginRegistry";
import type { PluginCapabilityCatalog } from "./PluginCapabilityCatalog";

export interface CompositionRevisionDescriptor {
  transactionId: string;
  appUIModelHash: string;
  capabilityCatalogRevision: string;
}

export interface RuntimeCompositionSnapshot<TState = unknown> {
  revision: string;
  transactionId?: string | undefined;
  appUIModelHash: string;
  capabilityCatalogRevision: string;
  publishedAt: string;
  appUIModel: AppUIModel;
  capabilityCatalog: PluginCapabilityCatalog<TState>;
  activeRegistry: PluginRegistry<TState>;
  compositionCatalog: PluginCompositionCatalog;
  runtimeModel: AppUIRuntimeModel;
}

export interface CandidateCompositionDiagnostic {
  revision: string;
  appUIModelHash?: string | undefined;
  capabilityCatalogRevision: string;
  occurredAt: string;
  status: "error" | "resolved";
  errorMessage?: string | undefined;
}

export interface RuntimeCompositionCandidate<TState = unknown> {
  appUIModelSource: string;
  capabilityCatalog: PluginCapabilityCatalog<TState>;
  capabilityCatalogRevision: string;
  revisionDescriptorSource?: string | undefined;
}

export interface RuntimeCompositionStore<TState = unknown> {
  getSnapshot(): RuntimeCompositionSnapshot<TState> | undefined;
  getCandidateDiagnostic(): CandidateCompositionDiagnostic | undefined;
  subscribe(listener: () => void): () => void;
  subscribeDiagnostics(listener: () => void): () => void;
  stageCandidate(candidate: RuntimeCompositionCandidate<TState>): void;
  stageAppUIModel(appUIModelSource: string): void;
  stageCapabilityCatalog(
    capabilityCatalog: PluginCapabilityCatalog<TState>,
    capabilityCatalogRevision: string,
  ): void;
}

function parseRevisionDescriptor(
  source: string | undefined,
): CompositionRevisionDescriptor | undefined {
  if (source === undefined) return undefined;
  const value = JSON.parse(source) as Record<string, unknown>;
  if (
    typeof value.transactionId !== "string" ||
    typeof value.appUIModelHash !== "string" ||
    !/^[a-f0-9]{64}$/u.test(value.appUIModelHash) ||
    typeof value.capabilityCatalogRevision !== "string" ||
    !/^[a-f0-9]{64}$/u.test(value.capabilityCatalogRevision)
  ) {
    throw new Error("The CompositionRevision descriptor is invalid.");
  }
  return {
    transactionId: value.transactionId,
    appUIModelHash: value.appUIModelHash,
    capabilityCatalogRevision: value.capabilityCatalogRevision,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sameServiceContract(
  declared: readonly string[],
  loaded: readonly string[] | undefined,
): boolean {
  const left = [...declared].sort();
  const right = [...(loaded ?? [])].sort();
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  return encoded === undefined ? "undefined" : encoded;
}

class TransactionalRuntimeCompositionStore<TState = unknown>
  implements RuntimeCompositionStore<TState> {
  #published: RuntimeCompositionSnapshot<TState> | undefined;
  #diagnostic: CandidateCompositionDiagnostic | undefined;
  #candidate: RuntimeCompositionCandidate<TState> | undefined;
  #generation = 0;
  #hasStaged = false;
  #lastDescriptorTransactionId: string | undefined;
  #pendingTransactionId: string | undefined;
  readonly #listeners = new Set<() => void>();
  readonly #diagnosticListeners = new Set<() => void>();

  getSnapshot = (): RuntimeCompositionSnapshot<TState> | undefined =>
    this.#published;

  getCandidateDiagnostic = (): CandidateCompositionDiagnostic | undefined =>
    this.#diagnostic;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  subscribeDiagnostics = (listener: () => void): (() => void) => {
    this.#diagnosticListeners.add(listener);
    return () => this.#diagnosticListeners.delete(listener);
  };

  stageCandidate(candidate: RuntimeCompositionCandidate<TState>): void {
    this.#candidate = candidate;
    const generation = ++this.#generation;
    void this.#buildAndPublish(candidate, generation);
  }

  stageAppUIModel(appUIModelSource: string): void {
    if (this.#candidate === undefined) return;
    this.stageCandidate({ ...this.#candidate, appUIModelSource });
  }

  stageCapabilityCatalog(
    capabilityCatalog: PluginCapabilityCatalog<TState>,
    capabilityCatalogRevision: string,
  ): void {
    if (this.#candidate === undefined) return;
    this.stageCandidate({
      ...this.#candidate,
      capabilityCatalog,
      capabilityCatalogRevision,
    });
  }

  async #buildAndPublish(
    candidate: RuntimeCompositionCandidate<TState>,
    generation: number,
  ): Promise<void> {
    let appUIModelHash: string | undefined;
    let candidateRevision = `candidate:${generation}`;
    try {
      appUIModelHash = await sha256Text(candidate.appUIModelSource);
      if (generation !== this.#generation) return;

      const descriptor = parseRevisionDescriptor(
        candidate.revisionDescriptorSource,
      );
      const descriptorTransactionId = descriptor?.transactionId;
      const descriptorChanged =
        this.#hasStaged &&
        descriptorTransactionId !== undefined &&
        descriptorTransactionId !== this.#lastDescriptorTransactionId;
      this.#hasStaged = true;
      this.#lastDescriptorTransactionId = descriptorTransactionId;
      if (descriptorChanged) {
        this.#pendingTransactionId = descriptorTransactionId;
      }

      const descriptorMatches =
        descriptor !== undefined &&
        descriptor.appUIModelHash === appUIModelHash &&
        descriptor.capabilityCatalogRevision ===
          candidate.capabilityCatalogRevision;
      if (
        this.#pendingTransactionId !== undefined &&
        (!descriptorMatches ||
          descriptor?.transactionId !== this.#pendingTransactionId)
      ) {
        return;
      }
      if (
        descriptorMatches &&
        descriptor?.transactionId === this.#pendingTransactionId
      ) {
        this.#pendingTransactionId = undefined;
      }

      const appUIModel = parseAppUIModelJson(candidate.appUIModelSource);
      const selectedPluginIds = [
        ...new Set(
          collectAppUIPluginLocations(appUIModel).map(
            ({ plugin }) => plugin.pluginId,
          ),
        ),
      ].sort();
      const definitions = await Promise.all(
        selectedPluginIds.map(async (pluginId) => {
          const capability = candidate.capabilityCatalog.get(pluginId);
          if (capability === undefined) {
            throw new Error(
              `AppUIModel selects UI plugin "${pluginId}", but the capability catalog does not declare it.`,
            );
          }
          const definition = await capability.loadDefinition();
          if (definition.manifest.id !== pluginId) {
            throw new Error(
              `UI plugin capability "${pluginId}" loaded definition "${definition.manifest.id}".`,
            );
          }
          if (
            canonicalJson(capability.manifest) !==
            canonicalJson(definition.manifest)
          ) {
            throw new Error(
              `UI plugin capability "${pluginId}" loaded a definition with stale manifest metadata.`,
            );
          }
          if (
            !sameServiceContract(capability.provides, definition.provides) ||
            !sameServiceContract(capability.inject, definition.inject) ||
            !sameServiceContract(
              capability.optionalInject,
              definition.optionalInject,
            )
          ) {
            throw new Error(
              `UI plugin capability "${pluginId}" does not match its generated service contract.`,
            );
          }
          return definition;
        }),
      );
      if (generation !== this.#generation) return;

      const activeRegistry = createPluginRegistry<TState>(
        definitions as readonly UIPluginDefinition<TState>[],
      );
      const compositionCatalog =
        createPluginCompositionCatalog(activeRegistry);
      const runtimeModel = compileAppUIModel(
        appUIModel,
        compositionCatalog,
      );
      const transactionId = descriptorMatches
        ? descriptor.transactionId
        : undefined;
      candidateRevision = transactionId ??
        `manual:${appUIModelHash}:${candidate.capabilityCatalogRevision}`;
      const published: RuntimeCompositionSnapshot<TState> = {
        revision: candidateRevision,
        ...(transactionId === undefined ? {} : { transactionId }),
        appUIModelHash,
        capabilityCatalogRevision: candidate.capabilityCatalogRevision,
        publishedAt: new Date().toISOString(),
        appUIModel,
        capabilityCatalog: candidate.capabilityCatalog,
        activeRegistry,
        compositionCatalog,
        runtimeModel,
      };
      if (generation !== this.#generation) return;
      this.#published = published;
      this.#listeners.forEach((listener) => listener());
      this.#setDiagnostic({
        revision: candidateRevision,
        appUIModelHash,
        capabilityCatalogRevision: candidate.capabilityCatalogRevision,
        occurredAt: published.publishedAt,
        status: "resolved",
      });
    } catch (error) {
      if (generation !== this.#generation) return;
      this.#setDiagnostic({
        revision: candidateRevision,
        ...(appUIModelHash === undefined ? {} : { appUIModelHash }),
        capabilityCatalogRevision: candidate.capabilityCatalogRevision,
        occurredAt: new Date().toISOString(),
        status: "error",
        errorMessage: errorMessage(error),
      });
    }
  }

  #setDiagnostic(diagnostic: CandidateCompositionDiagnostic): void {
    this.#diagnostic = diagnostic;
    this.#diagnosticListeners.forEach((listener) => listener());
  }
}

export function createRuntimeCompositionStore<TState = unknown>(): RuntimeCompositionStore<TState> {
  return new TransactionalRuntimeCompositionStore<TState>();
}
