import { loadAgentUISourceRegistry, resolveAgentUISourceItemClosure, resolveOfficialResource, OfficialResourceError } from "@agent-ui/source-registry";
import { realpath } from "node:fs/promises";
import { ensureResourcePackages, type ResourcePackageRunner } from "./ensure-resource-packages";
import { installOptionalAgentUIResource } from "./install-optional-agent-ui-resource";
import { activateOfficialResourcePlugin, inspectScenarioResources } from "./install-scenario-resources";
import { installDemoPlugin } from "./install-demo-plugin";
import { inspectUIComposition } from "./project-inspector";
import { inspectOfficialResourceImplementation } from "./official-resource-inspection";
import { verifyUIProject } from "../verify-ui";

const installations = new Map<string, Promise<void>>();

async function install(projectRoot: string, resourceId: string, runPackages?: ResourcePackageRunner): Promise<void> {
  const resource = resolveOfficialResource(resourceId);
  const implementation = resource.implementation;
  const registry = await loadAgentUISourceRegistry();
  const itemId = "sourceItemId" in implementation ? implementation.sourceItemId : `plugin/${implementation.pluginId}`;
  const closure = resolveAgentUISourceItemClosure(registry, itemId);
  // Package writes precede the source transaction. Failed attempts remain retryable;
  // neither partial dependencies nor partial source are advertised as ready.
  await ensureResourcePackages(projectRoot, closure, runPackages);
  if (implementation.type === "plugin") await installDemoPlugin(projectRoot, implementation.pluginId);
  else {
    await installOptionalAgentUIResource(projectRoot, implementation.sourceItemId);
    if (implementation.type === "source-plugin") await activateOfficialResourcePlugin(projectRoot, implementation);
  }
  const verification = await verifyUIProject(projectRoot);
  if (verification.status !== "passed") throw new OfficialResourceError("RESOURCE_INSTALL_FAILED", "Resource project verification failed.", verification.errors);
  const sources = await inspectScenarioResources(projectRoot);
  const composition = await inspectUIComposition(projectRoot);
  const inspection = inspectOfficialResourceImplementation(resource, composition, sources);
  if (inspection.status !== "ready") throw new OfficialResourceError(inspection.status === "conflict" ? "RESOURCE_CONFLICT" : "RESOURCE_INSTALL_FAILED", "Installed resource is not ready.", inspection);
}

/** Product-level installer; serialize dependency changes for each project. */
export async function installOfficialAgentUIResource(projectRoot: string, resourceId: string, options: { runPackages?: ResourcePackageRunner } = {}): Promise<void> {
  const root = await realpath(projectRoot);
  const previous = installations.get(root) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(() => install(root, resourceId, options.runPackages));
  installations.set(root, current);
  try { await current; }
  catch (error) {
    if (error instanceof OfficialResourceError) throw error;
    throw new OfficialResourceError("RESOURCE_INSTALL_FAILED", "Official resource installation failed.", error instanceof Error ? {
      message: error.message, stack: error.stack,
      ...("code" in error ? { code: error.code } : {}), ...("details" in error ? { details: error.details } : {}),
    } : error);
  }
  finally { if (installations.get(root) === current) installations.delete(root); }
}
