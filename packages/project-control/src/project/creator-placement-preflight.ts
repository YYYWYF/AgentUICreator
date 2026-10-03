import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { parseAppUIModelJson } from "../framework/contracts/app-ui-model";
import { parseUIPluginManifest } from "../framework/contracts/ui-plugin";
import { resolveAgentUIProjectPaths, projectControlConfigForPaths } from "./agent-ui-project-paths";
import { applyAppUIOperations } from "./app-ui-operations";
import { planDefaultPluginInsertion } from "./creator-action-planners";
import { readAgentUIProjectConfig } from "./project-mode";
import { collectPluginProjectFacts, generatePluginRegistryFromFacts } from "./registry-generator";
import type { PluginAsset } from "./types";

export interface CreatorPlacementPreflightInput {
  appUIModelHash: string;
  capabilityCatalogRevision: string;
  instanceId: string;
  manifest: unknown;
}

/** Placement only: the candidate stays out of the Registry and AppUIModel. */
export async function preflightCreatorPluginPlacement(
  projectRoot: string,
  input: CreatorPlacementPreflightInput,
) {
  const config = await readAgentUIProjectConfig(projectRoot);
  const paths = resolveAgentUIProjectPaths(projectRoot, config.config);
  const modelSource = await readFile(paths.appUIModelPath, "utf8");
  const appUIModelHash = createHash("sha256").update(modelSource).digest("hex");
  if (appUIModelHash !== input.appUIModelHash) {
    return { eligible: false, appUIModelHash, diagnostic: {
      code: "APP_UI_MODEL_HASH_CONFLICT",
      message: "AppUIModel changed after inspection; inspect the current Composition and retry.",
    } };
  }
  const model = parseAppUIModelJson(modelSource);
  const facts = await collectPluginProjectFacts(projectRoot, projectControlConfigForPaths(paths), paths);
  const generation = generatePluginRegistryFromFacts(model, facts);
  const capabilityCatalogRevision = generation.capabilityCatalog.revision;
  if (capabilityCatalogRevision !== input.capabilityCatalogRevision) {
    return { eligible: false, appUIModelHash, capabilityCatalogRevision, diagnostic: {
      code: "CAPABILITY_CATALOG_REVISION_CONFLICT",
      message: "Plugin declarations changed after inspection; inspect the current inventory and retry.",
    } };
  }

  const manifest = parseUIPluginManifest(input.manifest);
  if (!/^[a-z0-9][a-z0-9-]{0,99}$/u.test(manifest.id)) {
    return { eligible: false, appUIModelHash, capabilityCatalogRevision, diagnostic: {
      code: "UI_PLUGIN_ID_INVALID",
      message: "Plugin id must be a lowercase path-safe name of at most 100 characters.",
    } };
  }
  if (generation.assets.some((asset) => asset.pluginId === manifest.id)) {
    return { eligible: false, appUIModelHash, capabilityCatalogRevision, diagnostic: {
      code: "UI_PLUGIN_ID_ALREADY_EXISTS",
      message: `Plugin "${manifest.id}" already exists; inspect and reuse or edit that asset.`,
    } };
  }
  const candidate: PluginAsset = {
    pluginId: manifest.id,
    manifest,
    name: manifest.name,
    description: manifest.description,
    directory: manifest.id,
    manifestPath: path.posix.join("plugins", manifest.id, "manifest.json"),
    definitionPath: path.posix.join("plugins", manifest.id, "definition.ts"),
    capabilities: [...(manifest.capabilities ?? [])],
    ...(manifest.authoring === undefined ? {} : { authoring: manifest.authoring }),
    ...(manifest.application?.gate === undefined ? {} : { applicationGate: {
      service: manifest.application.gate.service,
      priority: manifest.application.gate.priority ?? 0,
    } }),
  };
  try {
    const plan = planDefaultPluginInsertion(
      model,
      { type: "insert_plugin_default", plugin: {
        id: input.instanceId, pluginId: manifest.id, enabled: true,
      } },
      { ...generation, assets: [...generation.assets, candidate] },
      { skipServiceReadiness: true },
    );
    applyAppUIOperations(model, plan.operations);
    return {
      eligible: true,
      appUIModelHash,
      capabilityCatalogRevision,
      pluginId: manifest.id,
      instanceId: input.instanceId,
      expectedPlacement: plan.expectedPlacement ?? plan.expectedGeometry,
      unverified: ["source-and-service-dependencies", "runtime-container-geometry"],
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && typeof error.code === "string") {
      return { eligible: false, appUIModelHash, capabilityCatalogRevision, diagnostic: {
        code: error.code,
        message: error.message,
        ...("details" in error ? { details: error.details } : {}),
      } };
    }
    throw error;
  }
}
