import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

import { creatorApplicationAuthoringTargets } from "./creator-authoring-targets";
import type { CreatorApplicationAuthoringTarget } from "./creator-authoring-targets";
import type {
  CreatorAuthoringTargetBinding,
  CreatorAuthoringTargetCandidate,
  CreatorAuthoringTargetCatalog,
  PluginAsset,
  PluginProjectFacts,
  UIOperatorConfig,
} from "./types";
import type { AgentUIProjectPaths } from "./agent-ui-project-paths";
import { projectRelativePath as resolvedProjectRelativePath } from "./agent-ui-project-paths";

// Match the wire inventory capacity (500 Plugins plus application owners).
// This is a transport safety bound, not a model option budget: ordinary requests
// no longer send this catalog to the request router.
export const MAX_CREATOR_AUTHORING_TARGETS = 512;
export const MAX_AUTHORING_TARGET_INTENTS = 16;
export const MAX_AUTHORING_TARGET_ID_CHARS = 100;
export const MAX_AUTHORING_TARGET_NAME_CHARS = 200;
export const MAX_AUTHORING_TARGET_DESCRIPTION_CHARS = 400;
export const MAX_AUTHORING_TARGET_PATH_CHARS = 400;

export interface CreatorAuthoringTargetCatalogInput {
  projectRoot: string;
  config: UIOperatorConfig;
  paths: AgentUIProjectPaths;
  projectFacts: PluginProjectFacts;
  /** Test and host extension point for application-owned declarations. */
  applicationTargets?: readonly CreatorApplicationAuthoringTarget[];
}

export class CreatorAuthoringTargetCatalogError extends Error {
  readonly code: string;
  readonly details: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "CreatorAuthoringTargetCatalogError";
    this.code = code;
    this.details = details;
  }
}

function fail(message: string, details?: unknown): never {
  throw new CreatorAuthoringTargetCatalogError(
    "CREATOR_AUTHORING_TARGET_CATALOG_INVALID",
    message,
    details,
  );
}

function boundedText(value: string, field: string, limit: number): string {
  if (value.trim().length === 0 || value.length > limit) {
    fail(`Authoring target ${field} is blank or exceeds its bound.`, {
      field,
      limit,
      actual: value.length,
    });
  }
  return value;
}

function projectRelativePath(projectRoot: string, value: string, field: string): string {
  boundedText(value, field, MAX_AUTHORING_TARGET_PATH_CHARS);
  const normalized = value.replaceAll("\\", "/");
  if (
    path.isAbsolute(value) ||
    path.isAbsolute(normalized) ||
    /^[A-Za-z]:\//u.test(normalized) ||
    normalized.split("/").some((part) => part === ".." || part === "" || part === ".")
  ) {
    fail(`Authoring target ${field} must be a normalized project-relative path.`, { field, value });
  }
  const resolved = path.resolve(projectRoot, normalized);
  const relative = path.relative(path.resolve(projectRoot), resolved).split(path.sep).join("/");
  if (relative === "" || relative.startsWith("../") || relative === "..") {
    fail(`Authoring target ${field} escapes the project root.`, { field, value });
  }
  return relative;
}

function underRoot(projectRoot: string, root: string, candidate: string, field: string): void {
  const resolvedRoot = path.resolve(projectRoot, root);
  const resolvedCandidate = path.resolve(projectRoot, candidate);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    fail(`Authoring target ${field} must remain under ${root}.`, { field, candidate, root });
  }
}

async function requireFile(projectRoot: string, projectRelative: string, field: string): Promise<void> {
  try {
    const info = await stat(path.join(projectRoot, projectRelative));
    if (!info.isFile()) fail(`Authoring target ${field} must point to a file.`, { projectRelative });
  } catch (error) {
    if (error instanceof CreatorAuthoringTargetCatalogError) throw error;
    fail(`Authoring target ${field} does not exist.`, { projectRelative });
  }
}

async function requireDirectory(
  projectRoot: string,
  projectRelative: string,
  field: string,
): Promise<void> {
  try {
    const info = await stat(path.join(projectRoot, projectRelative));
    if (!info.isDirectory()) {
      fail(`Authoring target ${field} must point to a directory.`, { projectRelative });
    }
  } catch (error) {
    if (error instanceof CreatorAuthoringTargetCatalogError) throw error;
    fail(`Authoring target ${field} does not exist.`, { projectRelative });
  }
}

function normalizeIntents(intents: readonly string[], targetId: string): string[] {
  if (intents.length === 0 || intents.length > MAX_AUTHORING_TARGET_INTENTS) {
    fail(`Authoring target ${targetId} has an invalid intent count.`, {
      actual: intents.length,
      limit: MAX_AUTHORING_TARGET_INTENTS,
    });
  }
  const result = intents.map((intent, index) =>
    boundedText(intent, `${targetId}.intents[${index}]`, MAX_AUTHORING_TARGET_DESCRIPTION_CHARS),
  );
  if (new Set(result).size !== result.length) {
    fail(`Authoring target ${targetId} contains duplicate intents.`);
  }
  return result;
}

function pluginSourceTarget(asset: PluginAsset): {
  candidate: CreatorAuthoringTargetCandidate;
  binding: CreatorAuthoringTargetBinding;
} {
  const targetId = `plugin-source:${asset.pluginId}`;
  const intents = [...new Set([...(asset.authoring?.intents ?? []),
    `modify ${asset.name} rendering`,
    `change ${asset.name} styling`,
    `change ${asset.name} interaction`,
    `change ${asset.name} behavior`,
    `modify ${asset.name} implementation`,
  ])].slice(0, MAX_AUTHORING_TARGET_INTENTS);
  return {
    candidate: {
      id: targetId,
      kind: "plugin_source",
      name: `${asset.name} Plugin ${asset.application ? "application" : "implementation"}`,
      description: asset.application
        ? `${asset.description.slice(0, 120)} Customize the project application with public props/composition and installed APIs. Application edits need no takeover; npm implementation edits need explicit consent.`
        : `Modify rendering, styling, interaction, or implementation behavior of the ${asset.name} Plugin.`,
      intents: normalizeIntents(intents, targetId),
      relatedPluginIds: [asset.pluginId],
    },
    binding: {
      targetId,
      kind: "plugin_source",
      ownerPath: asset.application?.entryPath ?? asset.definitionPath,
      ownerRoot: path.posix.dirname(asset.definitionPath),
      definitionPath: asset.definitionPath,
      manifestPath: asset.manifestPath,
      pluginId: asset.pluginId,
      relatedPluginIds: [asset.pluginId],
    },
  };
}

export function validateCreatorAuthoringTargetBinding(
  candidate: CreatorAuthoringTargetCandidate,
  binding: CreatorAuthoringTargetBinding,
  pluginIds: ReadonlySet<string>,
): void {
  if (binding.targetId !== candidate.id || binding.kind !== candidate.kind) {
    fail(`Authoring target ${candidate.id} has a mismatched Host binding.`);
  }
  for (const pluginId of candidate.relatedPluginIds ?? []) {
    if (!pluginIds.has(pluginId)) {
      fail(`Authoring target ${candidate.id} references an unknown Plugin.`, { pluginId });
    }
  }
}

export async function buildCreatorAuthoringTargetCatalog(
  input: CreatorAuthoringTargetCatalogInput,
): Promise<CreatorAuthoringTargetCatalog> {
  const pluginIds = new Set(input.projectFacts.assets.map((asset) => asset.pluginId));
  // Names only, from the target installation. This does not inspect types or
  // make missing optional catalog data a project admission requirement.
  const componentNames = new Map<string, string>();
  try {
    const catalogPath = createRequire(path.join(input.projectRoot, "package.json")).resolve("@za38.03/agent-ui-plugins/catalog.json");
    const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
    const pkg = JSON.parse(await readFile(path.join(path.dirname(catalogPath), "..", "package.json"), "utf8"));
    if (pkg.name === "@za38.03/agent-ui-plugins" && catalog.package?.name === pkg.name && catalog.package?.version === pkg.version) {
      for (const plugin of catalog.plugins ?? []) if (typeof plugin.application?.component === "string") componentNames.set(plugin.id, plugin.application.component);
    }
  } catch { /* Source-only projects retain their existing identity navigation. */ }
  const candidates: CreatorAuthoringTargetCandidate[] = [];
  const bindings: CreatorAuthoringTargetBinding[] = [];
  const targetIds = new Set<string>();
  const add = async (
    candidate: CreatorAuthoringTargetCandidate,
    binding: CreatorAuthoringTargetBinding,
  ): Promise<void> => {
    boundedText(candidate.id, "id", MAX_AUTHORING_TARGET_ID_CHARS);
    boundedText(candidate.name, `${candidate.id}.name`, MAX_AUTHORING_TARGET_NAME_CHARS);
    boundedText(candidate.description, `${candidate.id}.description`, MAX_AUTHORING_TARGET_DESCRIPTION_CHARS);
    if ((candidate.targetNames?.length ?? 0) > MAX_AUTHORING_TARGET_INTENTS) fail(`Too many navigation names for ${candidate.id}.`);
    for (const name of candidate.targetNames ?? []) boundedText(name, `${candidate.id}.targetNames`, MAX_AUTHORING_TARGET_NAME_CHARS);
    const relatedPluginIds = candidate.relatedPluginIds ?? [];
    if (relatedPluginIds.length > MAX_AUTHORING_TARGET_INTENTS) {
      fail(`Authoring target ${candidate.id} has too many related Plugins.`);
    }
    if (new Set(relatedPluginIds).size !== relatedPluginIds.length) {
      fail(`Authoring target ${candidate.id} contains duplicate related Plugins.`);
    }
    if (targetIds.has(candidate.id)) fail(`Duplicate authoring target id "${candidate.id}".`);
    validateCreatorAuthoringTargetBinding(candidate, binding, pluginIds);
    targetIds.add(candidate.id);
    candidates.push(candidate);
    bindings.push(binding);
  };

  const agentEntry = await readFile(path.join(input.paths.sourceRoot, "application", "Agent.tsx"), "utf8").then(source => source.includes("AgentApplication"), error => { if (error.code === "ENOENT") return false; throw error; });
  const applicationTargets: readonly CreatorApplicationAuthoringTarget[] = input.applicationTargets ?? creatorApplicationAuthoringTargets;
  for (const declaration of applicationTargets) {
    if (input.applicationTargets === undefined && declaration.relatedPluginIds?.length &&
        !declaration.relatedPluginIds.some((pluginId) => pluginIds.has(pluginId))) {
      continue;
    }
    // Local shell owners are opt-in. Legacy source projects keep their existing paths.
    if (declaration.projectOwnerPath && !agentEntry && input.applicationTargets === undefined &&
        !(await stat(path.join(input.paths.agentUIAdaptersRoot, declaration.ownerPath)).catch(() => undefined))) continue;
    const projectOwnerPath = declaration.projectOwnerPath === "application/locales.ts" &&
      !(await stat(path.join(input.paths.sourceRoot, "application", "locales.ts")).catch(() => undefined))
      ? "application/Agent.tsx" : declaration.projectOwnerPath;
    const declaredPath = input.applicationTargets === undefined
      ? resolvedProjectRelativePath(input.projectRoot, path.join(agentEntry ? input.paths.sourceRoot : input.paths.agentUIAdaptersRoot, agentEntry ? (projectOwnerPath ?? declaration.ownerPath) : declaration.ownerPath))
      : declaration.ownerPath;
    const ownerPath = projectRelativePath(input.projectRoot, declaredPath, `${declaration.id}.ownerPath`);
    // Existing projects without this opt-in application seam keep their catalog.
    if (declaration.optional && !(await stat(path.join(input.projectRoot, ownerPath)).catch(() => undefined))) {
      continue;
    }
    underRoot(input.projectRoot, resolvedProjectRelativePath(input.projectRoot, agentEntry && input.applicationTargets === undefined ? input.paths.sourceRoot : input.paths.agentUIAdaptersRoot), ownerPath, `${declaration.id}.ownerPath`);
    await requireFile(input.projectRoot, ownerPath, `${declaration.id}.ownerPath`);
    const relatedPluginIds = [...(declaration.relatedPluginIds ?? [])].filter(id => input.applicationTargets !== undefined || pluginIds.has(id));
    const candidate: CreatorAuthoringTargetCandidate = {
      id: declaration.id,
      kind: "application_config",
      name: declaration.name,
      description: agentEntry ? declaration.description.replace("Read ../theme/theme-customization.md for public tokens, scope, cascade and derived colors.", "Use public theme tokens and scoped CSS overrides.") : declaration.description,
      intents: normalizeIntents(declaration.intents, declaration.id),
      ...(relatedPluginIds.length === 0 ? {} : { relatedPluginIds }),
    };
    await add(candidate, {
      targetId: declaration.id,
      kind: "application_config",
      ownerPath,
      ownerRoot: path.posix.dirname(ownerPath),
      ...(relatedPluginIds.length === 0 ? {} : { relatedPluginIds }),
    });
  }

  for (const asset of input.projectFacts.assets) {
    if (asset.ownership === "official_package") {
      const id = `official-plugin-reference:${asset.pluginId}`;
      await add({ id, kind: "official_plugin_reference", name: asset.name,
        description: `Dependency-owned Plugin. Inspect public Slots and APIs, if implementation edits are necessary use takeover_plugin_source to request explicit source ownership confirmation; reference source: ${asset.referenceSourceItemId}.`,
        intents: [`customize ${asset.name}`, `port official capabilities to a custom ${asset.name}`], relatedPluginIds: [asset.pluginId],
        targetNames: [asset.pluginId, ...(componentNames.has(asset.pluginId) ? [componentNames.get(asset.pluginId)!] : [])] },
        { targetId: id, kind: "official_plugin_reference", pluginId: asset.pluginId, relatedPluginIds: [asset.pluginId] });
      continue;
    }
    const sourceTarget = pluginSourceTarget(asset);
    sourceTarget.candidate.targetNames = [asset.pluginId, ...(asset.application?.implementationOwnership === "npm" && componentNames.has(asset.pluginId) ? [componentNames.get(asset.pluginId)!] : [])];
    const ownerRoot = projectRelativePath(input.projectRoot, sourceTarget.binding.ownerRoot!, `${sourceTarget.candidate.id}.ownerRoot`);
    const definitionPath = projectRelativePath(input.projectRoot, sourceTarget.binding.definitionPath!, `${sourceTarget.candidate.id}.definitionPath`);
    const manifestPath = projectRelativePath(input.projectRoot, sourceTarget.binding.manifestPath!, `${sourceTarget.candidate.id}.manifestPath`);
    underRoot(input.projectRoot, resolvedProjectRelativePath(input.projectRoot, input.paths.pluginsRoot), ownerRoot, `${sourceTarget.candidate.id}.ownerRoot`);
    await requireDirectory(input.projectRoot, ownerRoot, `${sourceTarget.candidate.id}.ownerRoot`);
    await requireFile(input.projectRoot, definitionPath, `${sourceTarget.candidate.id}.definitionPath`);
    await requireFile(input.projectRoot, manifestPath, `${sourceTarget.candidate.id}.manifestPath`);
    let ownerPath: string | undefined;
    if (sourceTarget.binding.ownerPath) {
      ownerPath = projectRelativePath(input.projectRoot, sourceTarget.binding.ownerPath, `${sourceTarget.candidate.id}.ownerPath`);
      underRoot(input.projectRoot, ownerRoot, ownerPath, `${sourceTarget.candidate.id}.ownerPath`);
      await requireFile(input.projectRoot, ownerPath, `${sourceTarget.candidate.id}.ownerPath`);
    }
    await add(sourceTarget.candidate, {
      ...sourceTarget.binding,
      ...(ownerPath ? { ownerPath } : {}),
      ownerRoot,
      definitionPath,
      manifestPath,
    });
  }

  if (candidates.length > MAX_CREATOR_AUTHORING_TARGETS) {
    fail(`Creator Authoring Target Catalog exceeds ${MAX_CREATOR_AUTHORING_TARGETS} targets.`, {
      actual: candidates.length,
      limit: MAX_CREATOR_AUTHORING_TARGETS,
    });
  }

  const source = JSON.stringify({ candidates, bindings });
  return {
    revision: createHash("sha256").update(source).digest("hex"),
    candidates,
    bindings,
  };
}
