import { officialPackagePlugin, loadAgentUISourceRegistry, resolveAgentUISourceItemClosure, resolveOfficialResource, OfficialResourceError } from "@agent-ui/source-registry";
import { migrateOfficialPackagePlugin } from "./migrate-official-package-plugin";
import { realpath } from "node:fs/promises";
import { ensureResourcePackages, type ResourcePackageRunner } from "./ensure-resource-packages";
import { installOptionalAgentUIResource } from "./install-optional-agent-ui-resource";
import { activateOfficialResourcePlugin, inspectScenarioResources } from "./install-scenario-resources";
import { installDemoPlugin } from "./install-demo-plugin";
import { inspectUIComposition } from "./project-inspector";
import { inspectOfficialResourceImplementation } from "./official-resource-inspection";
import { verifyUIProject } from "../verify-ui";

export interface OfficialResourceInstallResult { resourceId: string; changed: boolean; reenabled: boolean; verification?: Awaited<ReturnType<typeof verifyUIProject>> }
const installations = new Map<string, Promise<OfficialResourceInstallResult>>();

async function install(projectRoot: string, resourceId: string, runPackages?: ResourcePackageRunner): Promise<OfficialResourceInstallResult> {
  const resource = resolveOfficialResource(resourceId);
  if (resource.implementation.type === "plugin" && officialPackagePlugin(resource.implementation.pluginId)) {
    const registry = await loadAgentUISourceRegistry();
    await ensureResourcePackages(projectRoot, resolveAgentUISourceItemClosure(registry, `plugin/${resource.implementation.pluginId}`), runPackages);
    await migrateOfficialPackagePlugin(projectRoot, resource.implementation.pluginId);
  }
  const sourcesBefore = await inspectScenarioResources(projectRoot);
  const before = inspectOfficialResourceImplementation(resource, await inspectUIComposition(projectRoot), sourcesBefore);
  if (before.status === "conflict") throw new OfficialResourceError("RESOURCE_CONFLICT", "Resource installation conflicts with the current project.", before);
  if (before.status === "ready") return { resourceId, changed: false, reenabled: false };
  const implementation = resource.implementation;
  const registry = await loadAgentUISourceRegistry();
  const itemId = "sourceItemId" in implementation ? implementation.sourceItemId : `plugin/${implementation.pluginId}`;
  const closure = resolveAgentUISourceItemClosure(registry, itemId);
  // Package writes precede the source transaction. Failed attempts remain retryable;
  // neither partial dependencies nor partial source are advertised as ready.
  await ensureResourcePackages(projectRoot, closure, runPackages);
  if (implementation.type === "plugin") await installDemoPlugin(projectRoot, implementation.pluginId);
  else {
    if (!before.closure.every(item => item && ["managed", "customized"].includes(item.status))) {
      await installOptionalAgentUIResource(projectRoot, implementation.sourceItemId);
    }
    if (implementation.type === "source-plugin") await activateOfficialResourcePlugin(projectRoot, implementation);
  }
  const verification = await verifyUIProject(projectRoot);
  if (verification.status !== "passed") throw new OfficialResourceError("RESOURCE_INSTALL_FAILED", "Resource project verification failed.", verification.errors);
  const sources = await inspectScenarioResources(projectRoot);
  const composition = await inspectUIComposition(projectRoot);
  const inspection = inspectOfficialResourceImplementation(resource, composition, sources);
  if (inspection.status !== "ready") throw new OfficialResourceError(inspection.status === "conflict" ? "RESOURCE_CONFLICT" : "RESOURCE_INSTALL_FAILED", "Installed resource is not ready.", inspection);
  return { resourceId, changed: true, reenabled: before.status === "disabled", verification };
}

/** Product-level installer; serialize dependency changes for each project. */
export async function installOfficialAgentUIResource(projectRoot: string, resourceId: string, options: { runPackages?: ResourcePackageRunner } = {}): Promise<OfficialResourceInstallResult> {
  const root = await realpath(projectRoot);
  const previous = installations.get(root) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(() => install(root, resourceId, options.runPackages));
  installations.set(root, current);
  try { return await current; }
  catch (error) {
    if (error instanceof OfficialResourceError) throw error;
    throw new OfficialResourceError("RESOURCE_INSTALL_FAILED", "Official resource installation failed.", error instanceof Error ? {
      message: error.message, stack: error.stack,
      ...("code" in error ? { code: error.code } : {}), ...("details" in error ? { details: error.details } : {}),
    } : error);
  }
  finally { if (installations.get(root) === current) installations.delete(root); }
}
