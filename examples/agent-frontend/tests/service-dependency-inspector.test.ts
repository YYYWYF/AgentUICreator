import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { AppUIModel } from "../framework/contracts/app-ui-model";
import { collectPluginAssets } from "../scripts/ui-project/plugin-assets";
import { inspectUIServiceDependencies } from "../scripts/ui-project/service-dependency-inspector";

const temporaryProjects: string[] = [];
const config = { catalogs: [], uiPackages: [] };

async function createServiceProject() {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "ui-services-"));
  temporaryProjects.push(projectRoot);
  await mkdir(path.join(projectRoot, "services"));
  await writeFile(
    path.join(projectRoot, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        module: "ESNext",
        moduleResolution: "Bundler",
        target: "ES2022",
      },
      include: ["plugins/**/*.ts", "services/**/*.ts"],
    }),
  );
  await writeFile(
    path.join(projectRoot, "services", "workspace-files.ts"),
    'export const WORKSPACE_FILE_SERVICE = "workspace.files" as const;\n',
  );
  const definitions = {
    provider:
      'import { WORKSPACE_FILE_SERVICE } from "../../services/workspace-files";\n' +
      "const Component = () => null;\n" +
      "export default { manifest: {}, provides: [WORKSPACE_FILE_SERVICE], Component };\n",
    required:
      'import { WORKSPACE_FILE_SERVICE } from "../../services/workspace-files";\n' +
      "const Component = () => null;\n" +
      "export default { manifest: {}, inject: [WORKSPACE_FILE_SERVICE], Component };\n",
    optional:
      'import { WORKSPACE_FILE_SERVICE } from "../../services/workspace-files";\n' +
      "const Component = () => null;\n" +
      "export default { manifest: {}, optionalInject: [WORKSPACE_FILE_SERVICE], Component };\n",
  };
  for (const [pluginId, source] of Object.entries(definitions)) {
    await mkdir(path.join(projectRoot, "plugins", pluginId), { recursive: true });
    await writeFile(
      path.join(projectRoot, "plugins", pluginId, "manifest.json"),
      JSON.stringify({
        id: pluginId,
        name: pluginId,
        description: `${pluginId} fixture`,
        version: "1.0.0",
        capabilities: ["visual"],
      }),
    );
    await writeFile(
      path.join(projectRoot, "plugins", pluginId, "definition.ts"),
      source,
    );
  }
  const inventory = await collectPluginAssets(projectRoot, config);
  return { projectRoot, assets: inventory.assets };
}

function model(providerEnabled = true): AppUIModel {
  return {
    version: "2",
    root: { type: "slot", id: "root", slotId: "root" },
    pluginInstances: {
      provider: {
        id: "provider",
        pluginId: "provider",
        enabled: providerEnabled,
        mount: { slotId: "root" },
      },
      required: {
        id: "required",
        pluginId: "required",
        enabled: true,
        mount: { slotId: "root" },
      },
      optional: {
        id: "optional",
        pluginId: "optional",
        enabled: true,
        mount: { slotId: "root" },
      },
    },
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryProjects.splice(0).map((projectRoot) =>
      rm(projectRoot, { recursive: true, force: true }),
    ),
  );
});

describe("service dependency inspector", () => {
  it("resolves constant Service Names and reports provider/consumer topology", async () => {
    const { projectRoot, assets } = await createServiceProject();

    const inspection = inspectUIServiceDependencies(
      projectRoot,
      model(),
      assets,
    );

    expect(inspection.plugins).toContainEqual({
      pluginId: "optional",
      provides: [],
      inject: [],
      optionalInject: ["workspace.files"],
    });
    expect(inspection.services).toContainEqual(
      expect.objectContaining({
        name: "workspace.files",
        status: "available",
        providers: [expect.objectContaining({ pluginId: "provider" })],
        requiredConsumers: [expect.objectContaining({ pluginId: "required" })],
        optionalConsumers: [expect.objectContaining({ pluginId: "optional" })],
      }),
    );
    expect(inspection.issues).toEqual([]);
  });

  it("distinguishes required missing, optional unavailable, and collisions", async () => {
    const { projectRoot, assets } = await createServiceProject();
    const missingModel = model(false);
    const requiredMissing = inspectUIServiceDependencies(
      projectRoot,
      missingModel,
      assets,
    );
    expect(requiredMissing.services[0]?.status).toBe("required-missing");
    expect(requiredMissing.issues).toContainEqual(
      expect.objectContaining({ code: "required-service-missing" }),
    );

    missingModel.pluginInstances.required!.enabled = false;
    const optionalUnavailable = inspectUIServiceDependencies(
      projectRoot,
      missingModel,
      assets,
    );
    expect(optionalUnavailable.services[0]?.status).toBe("optional-unavailable");
    expect(optionalUnavailable.issues).toEqual([]);

    const collisionModel = model();
    collisionModel.pluginInstances["provider-second"] = {
      id: "provider-second",
      pluginId: "provider",
      enabled: true,
      mount: { slotId: "root" },
    };
    const collision = inspectUIServiceDependencies(
      projectRoot,
      collisionModel,
      assets,
    );
    expect(collision.services[0]?.status).toBe("provider-collision");
    expect(collision.issues).toContainEqual(
      expect.objectContaining({ code: "service-provider-collision" }),
    );
  });
});
