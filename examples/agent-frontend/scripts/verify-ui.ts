import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseAppUIModelJson,
  type AppUIModel,
} from "../framework/contracts/app-ui-model.ts";
import {
  inspectUIPluginSlotContracts,
  parseUIPluginSlotDefinitions,
  type UIPluginDefinition,
} from "../framework/contracts/ui-plugin.ts";
import { uiProjectControlConfig } from "./ui-project/project-config";
import {
  GENERATED_PLUGIN_REGISTRY_PATH,
  generatePluginRegistry,
  PLUGIN_REGISTRY_ENTRY_PATH,
  PLUGIN_REGISTRY_ENTRY_SOURCE,
} from "./ui-project/registry-generator";
import type {
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
  registry: {
    pluginIds: string[];
    headlessPluginIds: string[];
    generatedFileFresh: boolean;
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
  model: AppUIModel,
  pluginIds: ReadonlySet<string>,
  headlessPluginIds: ReadonlySet<string>,
): {
  mountedInstanceIds: string[];
  unmountedEnabledInstanceIds: string[];
  errors: VerificationIssue[];
  warnings: VerificationIssue[];
} {
  const mounted = new Set<string>();
  Object.values(model.slots).forEach((slot) => {
    slot.occupants.forEach((occupant) => mounted.add(occupant.instanceId));
  });
  const errors: VerificationIssue[] = [];
  const warnings: VerificationIssue[] = [];

  for (const instance of Object.values(model.pluginInstances)) {
    if (!pluginIds.has(instance.pluginId)) {
      errors.push({
        code: "unregistered-plugin",
        message: `PluginInstance "${instance.id}" references unregistered UI plugin "${instance.pluginId}".`,
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
        !headlessPluginIds.has(instance.pluginId),
    );
  const unmountedEnabledInstanceIds = unmountedEnabledInstances
    .map((instance) => instance.id)
    .sort();
  for (const instance of unmountedEnabledInstances) {
    errors.push({
      code: "unmounted-enabled-instance",
      message: `Enabled visual PluginInstance "${instance.id}" is not mounted. Add it to a Slot or declare UI plugin "${instance.pluginId}" with the "headless" capability.`,
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
  definitions?: readonly UIPluginDefinition[],
): Promise<UIProjectVerification> {
  const errors: VerificationIssue[] = [];
  const warnings: VerificationIssue[] = [];
  let model: AppUIModel | undefined;

  try {
    model = parseAppUIModelJson(
      await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"),
    );
  } catch (error) {
    errors.push({
      code: "app-ui-model",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  let pluginIds: string[] = [];
  let headlessPluginIds: string[] = [];
  let generatedFileFresh = false;
  if (model !== undefined) {
    const registry = await generatePluginRegistry(projectRoot, model, config);
    errors.push(...registry.errors);
    pluginIds = registry.registeredPluginIds;
    headlessPluginIds = registry.headlessPluginIds;

    const slotContractDefinitions: UIPluginDefinition[] = [];
    for (const asset of registry.assets.filter((candidate) =>
      registry.selectedPluginIds.includes(candidate.pluginId),
    )) {
      const contractPath = path.join(
        projectRoot,
        "plugins",
        asset.directory,
        "slots.json",
      );
      const contractSource = await readOptional(contractPath);
      let slots: UIPluginDefinition["slots"];
      if (contractSource !== undefined) {
        try {
          slots = parseUIPluginSlotDefinitions(JSON.parse(contractSource));
        } catch (error) {
          errors.push({
            code: "plugin-slot-contract-invalid",
            message: `${path.relative(projectRoot, contractPath)} is invalid: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
      slotContractDefinitions.push({
        manifest: {
          id: asset.pluginId,
          name: asset.pluginId,
          description: "Static Slot contract inspection",
          version: "0",
        },
        ...(slots === undefined ? {} : { slots }),
        Component: () => null,
      });
    }

    const generatedSource = await readOptional(
      path.join(projectRoot, GENERATED_PLUGIN_REGISTRY_PATH),
    );
    if (registry.errors.length === 0 && generatedSource === undefined) {
      errors.push({
        code: "plugin-registry-generated-missing",
        message: `${GENERATED_PLUGIN_REGISTRY_PATH} is missing. Run pnpm generate:registry.`,
      });
    } else if (
      registry.errors.length === 0 &&
      generatedSource !== registry.source
    ) {
      errors.push({
        code: "plugin-registry-generated-stale",
        message: `${GENERATED_PLUGIN_REGISTRY_PATH} is stale. Run pnpm generate:registry.`,
      });
    }

    const entrySource = await readOptional(
      path.join(projectRoot, PLUGIN_REGISTRY_ENTRY_PATH),
    );
    if (entrySource !== PLUGIN_REGISTRY_ENTRY_SOURCE) {
      errors.push({
        code: "plugin-registry-entry",
        message: `${PLUGIN_REGISTRY_ENTRY_PATH} must only re-export the generated production registry.`,
      });
    }
    generatedFileFresh =
      registry.errors.length === 0 &&
      generatedSource === registry.source &&
      entrySource === PLUGIN_REGISTRY_ENTRY_SOURCE;
    errors.push(
      ...inspectUIPluginSlotContracts(
        model,
        definitions ?? slotContractDefinitions,
        { checkChainSelectors: definitions !== undefined },
      ),
    );
  }

  const instances =
    model === undefined
      ? {
          mountedInstanceIds: [],
          unmountedEnabledInstanceIds: [],
          errors: [],
          warnings: [],
        }
      : verifyInstances(
          model,
          new Set(pluginIds),
          new Set(headlessPluginIds),
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
    registry: {
      pluginIds,
      headlessPluginIds,
      generatedFileFresh,
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
