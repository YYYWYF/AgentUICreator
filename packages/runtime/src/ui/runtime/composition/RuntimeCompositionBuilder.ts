import type { ConversationToolkit } from "@za38.03/agent-ui-plugins";
import {
  collectAppUIPluginLocations,
  parseAppUIModelJson,
  type AppUIModel,
} from "../../framework/contracts/app-ui-model.js";
import { compileAppUIModel } from "../../framework/contracts/app-ui-compiler.js";
import type { AppUIRuntimeModel } from "../../framework/contracts/app-ui-runtime-model.js";
import type { PluginCompositionCatalog } from "../../framework/contracts/app-ui-composition.js";
import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin.js";
import { sha256Text } from "../diagnostics/app-ui-model-hash.js";
import {
  createPluginCompositionCatalog,
  createPluginRegistry,
  type PluginRegistry,
} from "../plugins/PluginRegistry.js";
import { validateDataMessageUIDefinitions } from "../plugins/data-message-ui-registrations.js";
import { resolvePluginConversationToolkit } from "../plugins/plugin-conversation-toolkit.js";
import type { PluginCapabilityCatalog } from "./PluginCapabilityCatalog.js";

export interface RuntimeCompositionBuildInput<TState = unknown> {
  /** Application-owned base entries, validated together with Plugin contributions. */
  baseConversationToolkit?: ConversationToolkit | undefined;
  appUIModelSource: string;
  capabilityCatalog: PluginCapabilityCatalog<TState>;
  capabilityCatalogRevision: string;
}

export interface RuntimeCompositionBuildResult<TState = unknown> {
  /** Final toolkit validated before this candidate can be published. */
  conversationToolkit: ConversationToolkit;
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
      locations.filter(({ plugin }) => plugin.enabled).map(
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
      if (capability.implementationExcluded === true || capability.loadDefinition === undefined) {
        throw new Error(`UI plugin "${pluginId}" has no enabled implementation. Regenerate the Plugin Registry after enabling it.`);
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
    input.capabilityCatalog.list(),
  );
  const compositionCatalog = createPluginCompositionCatalog(activeRegistry);
  const runtimeModel = compileAppUIModel(appUIModel, compositionCatalog);
  validateDataMessageUIDefinitions(runtimeModel, activeRegistry);
  const conversationToolkit = resolvePluginConversationToolkit(runtimeModel, activeRegistry, input.baseConversationToolkit);

  return {
    conversationToolkit,
    appUIModelHash,
    appUIModel,
    activeRegistry,
    compositionCatalog,
    runtimeModel,
  };
}
