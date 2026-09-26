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
import { validateDataMessageUIDefinitions } from "../plugins/data-message-ui-registrations";
import { resolvePluginConversationToolkit } from "../plugins/plugin-conversation-toolkit";
import type { PluginCapabilityCatalog } from "./PluginCapabilityCatalog";

export interface RuntimeCompositionBuildInput<TState = unknown> {
  appUIModelSource: string;
  capabilityCatalog: PluginCapabilityCatalog<TState>;
  capabilityCatalogRevision: string;
}

export interface RuntimeCompositionBuildResult<TState = unknown> {
  appUIModelHash: string;
  appUIModel: AppUIModel;
  activeRegistry: PluginRegistry<TState>;
  compositionCatalog: PluginCompositionCatalog;
  runtimeModel: AppUIRuntimeModel;
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

export async function buildRuntimeComposition<TState = unknown>(
  input: RuntimeCompositionBuildInput<TState>,
): Promise<RuntimeCompositionBuildResult<TState>> {
  const appUIModelHash = await sha256Text(input.appUIModelSource);
  const appUIModel = parseAppUIModelJson(input.appUIModelSource);
  const locations = collectAppUIPluginLocations(appUIModel);
  const selectedPluginIds = [
    ...new Set(
      locations.map(
        ({ plugin }) => plugin.pluginId,
      ),
    ),
  ].sort();
  const definitions = await Promise.all(
    selectedPluginIds.map(async (pluginId) => {
      const capability = input.capabilityCatalog.get(pluginId);
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
  const activeRegistry = createPluginRegistry<TState>(
    definitions as readonly UIPluginDefinition<TState>[],
  );
  const compositionCatalog = createPluginCompositionCatalog(activeRegistry);
  const runtimeModel = compileAppUIModel(appUIModel, compositionCatalog);
  validateDataMessageUIDefinitions(runtimeModel, activeRegistry);
  resolvePluginConversationToolkit(runtimeModel, activeRegistry);

  return {
    appUIModelHash,
    appUIModel,
    activeRegistry,
    compositionCatalog,
    runtimeModel,
  };
}
