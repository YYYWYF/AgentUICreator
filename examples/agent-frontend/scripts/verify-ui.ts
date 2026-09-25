import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseAppUIModelJson,
  type AppUIModel,
} from "../framework/contracts/app-ui-model.ts";
import { compileAppUIModel } from "../framework/contracts/app-ui-compiler.ts";
import type { AppUIRuntimeModel } from "../framework/contracts/app-ui-runtime-model.ts";
import { uiProjectControlConfig } from "./ui-project/project-config";
import { resolveAgentUIProjectPaths, projectControlConfigForPaths, projectRelativePath } from "./ui-project/agent-ui-project-paths";
import { readAgentUIProjectConfig } from "./ui-project/project-mode";
import type { AgentUIProjectConfig } from "../framework/contracts/agent-ui-project";
import { verifyPluginChildSlots } from "./ui-project/plugin-child-slot-verifier";
import {
  generatePluginRegistry,
  PLUGIN_REGISTRY_ENTRY_SOURCE,
} from "./ui-project/registry-generator";
import { inspectUIServiceDependencies } from "./ui-project/service-dependency-inspector";
import { analyzePluginAuthoringReadiness } from "./ui-project/plugin-authoring-readiness";
import type {
  InspectedService,
  PluginCreatorReadiness,
  ProjectIssue,
  UIProjectControlConfig,
} from "./ui-project/types";

export type VerificationIssue = ProjectIssue;

export interface UIProjectVerification {
  status: "passed" | "failed";
  model: {
    valid: boolean;
    mountedInstanceIds: string[];
    unmountedEnabledInstanceIds: string[];
  };
  capabilityCatalog: {
    pluginIds: string[];
    generatedFileFresh: boolean;
  };
  activeComposition: {
    selectedPluginIds: string[];
    resolvedPluginIds: string[];
    headlessPluginIds: string[];
  };
  services: InspectedService[];
  creatorReadiness: {
    plugins: PluginCreatorReadiness[];
  };
  errors: VerificationIssue[];
  warnings: VerificationIssue[];
}

const defaultProjectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function readOptional(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function verifyInstances(
  model: AppUIRuntimeModel,
  pluginIds: ReadonlySet<string>,
  unmountedAllowedPluginIds: ReadonlySet<string>,
): {
  mountedInstanceIds: string[];
  unmountedEnabledInstanceIds: string[];
  errors: VerificationIssue[];
  warnings: VerificationIssue[];
} {
  const mounted = new Set(
    Object.values(model.pluginInstances)
      .filter((instance) => instance.mount !== undefined)
      .map((instance) => instance.id),
  );
  const errors: VerificationIssue[] = [];
  const warnings: VerificationIssue[] = [];

  for (const instance of Object.values(model.pluginInstances)) {
    if (!pluginIds.has(instance.pluginId)) {
      errors.push({
        code: "unresolved-plugin",
        message: `PluginInstance "${instance.id}" references unresolved active UI plugin "${instance.pluginId}".`,
      });
    }
    if (mounted.has(instance.id) && !instance.enabled) {
      warnings.push({
        code: "mounted-disabled-instance",
        message: `PluginInstance "${instance.id}" is mounted but disabled.`,
      });
    }
  }

  const unmountedEnabledInstances = Object.values(model.pluginInstances)
    .filter(
      (instance) =>
        instance.enabled &&
        !mounted.has(instance.id) &&
        !unmountedAllowedPluginIds.has(instance.pluginId),
    );
  const unmountedEnabledInstanceIds = unmountedEnabledInstances
    .map((instance) => instance.id)
    .sort();
  for (const instance of unmountedEnabledInstances) {
    warnings.push({
      code: "unmounted-enabled-instance",
      message: `Enabled visual PluginInstance "${instance.id}" has no ordinary UI mount and will remain inactive.`,
    });
  }

  return {
    mountedInstanceIds: [...mounted].sort(),
    unmountedEnabledInstanceIds,
    errors,
    warnings,
  };
}

export async function verifyUIProject(
  projectRoot: string,
  config: UIProjectControlConfig = uiProjectControlConfig,
  options: { projectConfigOverride?: AgentUIProjectConfig } = {},
): Promise<UIProjectVerification> {
  const errors: VerificationIssue[] = [];
  const warnings: VerificationIssue[] = [];
  let model: AppUIModel | undefined;
  const projectConfig = options.projectConfigOverride ?? (await readAgentUIProjectConfig(projectRoot, config.agentUI.metadataRoot)).config;
  const paths = resolveAgentUIProjectPaths(projectRoot, projectConfig, config);
  const effectiveConfig = projectControlConfigForPaths(paths, config);
  const registryRelativePath = projectRelativePath(projectRoot, paths.generatedPluginRegistryPath);
  const entryRelativePath = projectRelativePath(projectRoot, paths.pluginRegistryEntryPath);

  try {
    model = parseAppUIModelJson(
      await readFile(paths.appUIModelPath, "utf8"),
    );
  } catch (error) {
    errors.push({
      code: "app-ui-model",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  let pluginIds: string[] = [];
  let selectedPluginIds: string[] = [];
  let capabilityPluginIds: string[] = [];
  let headlessPluginIds: string[] = [];
  let applicationGatePluginIds: string[] = [];
  let dataMessageUIPluginIds: string[] = [];
  let generatedFileFresh = false;
  let services: InspectedService[] = [];
  let creatorReadiness: PluginCreatorReadiness[] = [];
  let runtimeModel: AppUIRuntimeModel | undefined;
  if (model !== undefined) {
    const registry = await generatePluginRegistry(projectRoot, model, { config: effectiveConfig, paths });
    errors.push(...registry.errors);
    errors.push(...(await verifyPluginChildSlots(projectRoot, registry.assets)));
    const authoringReadiness = analyzePluginAuthoringReadiness(registry.assets);
    creatorReadiness = authoringReadiness.plugins;
    errors.push(...authoringReadiness.errors);
    warnings.push(...authoringReadiness.warnings);
    const serviceInspection = inspectUIServiceDependencies(
      projectRoot,
      model,
      registry.assets,
      path.dirname(paths.pluginsRoot),
    );
    services = serviceInspection.services;
    errors.push(...serviceInspection.issues);
    capabilityPluginIds = registry.capabilityCatalog.pluginIds;
    selectedPluginIds = registry.activeComposition.selectedPluginIds;
    pluginIds = registry.activeComposition.resolvedPluginIds;
    headlessPluginIds = registry.activeComposition.headlessPluginIds;
    applicationGatePluginIds = registry.assets
      .filter((asset) => asset.applicationGate !== undefined)
      .map((asset) => asset.pluginId);
    dataMessageUIPluginIds = registry.assets
      .filter((asset) => asset.manifest.data?.messageUI === true)
      .map((asset) => asset.pluginId);
    if (registry.errors.length === 0) {
      runtimeModel = compileAppUIModel(
        model,
        registry.activeComposition.compositionCatalog,
      );
    }

    const generatedSource = await readOptional(
      paths.generatedPluginRegistryPath,
    );
    if (registry.errors.length === 0 && generatedSource === undefined) {
      errors.push({
        code: "plugin-registry-generated-missing",
        message: `${registryRelativePath} is missing. Run pnpm generate:registry.`,
      });
    } else if (
      registry.errors.length === 0 &&
      generatedSource !== registry.capabilityCatalog.source
    ) {
      errors.push({
        code: "plugin-registry-generated-stale",
        message: `${registryRelativePath} is stale. Run pnpm generate:registry.`,
      });
    }

    const entrySource = await readOptional(
      paths.pluginRegistryEntryPath,
    );
    if (entrySource !== PLUGIN_REGISTRY_ENTRY_SOURCE) {
      errors.push({
        code: "plugin-registry-entry",
        message: `${entryRelativePath} must only re-export the generated capability catalog.`,
      });
    }
    generatedFileFresh =
      registry.errors.length === 0 &&
      generatedSource === registry.capabilityCatalog.source &&
      entrySource === PLUGIN_REGISTRY_ENTRY_SOURCE;

  }

  const instances =
    runtimeModel === undefined
      ? {
          mountedInstanceIds: [],
          unmountedEnabledInstanceIds: [],
          errors: [],
          warnings: [],
        }
      : verifyInstances(
          runtimeModel,
          new Set(pluginIds),
          new Set([
            ...headlessPluginIds,
            ...applicationGatePluginIds,
            ...dataMessageUIPluginIds,
          ]),
        );
  errors.push(...instances.errors);
  warnings.push(...instances.warnings);

  return {
    status: errors.length === 0 ? "passed" : "failed",
    model: {
      valid: model !== undefined,
      mountedInstanceIds: instances.mountedInstanceIds,
      unmountedEnabledInstanceIds: instances.unmountedEnabledInstanceIds,
    },
    capabilityCatalog: {
      pluginIds: capabilityPluginIds,
      generatedFileFresh,
    },
    activeComposition: {
      selectedPluginIds,
      resolvedPluginIds: pluginIds,
      headlessPluginIds,
    },
    services,
    creatorReadiness: {
      plugins: creatorReadiness,
    },
    errors,
    warnings,
  };
}

async function main(): Promise<void> {
  const result = await verifyUIProject(defaultProjectRoot);

  const output = JSON.stringify(result, null, 2);
  if (result.status === "passed") {
    console.log(output);
    return;
  }
  console.error(output);
  process.exitCode = 1;
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
