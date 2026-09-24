import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { AppUIModel } from "../framework/contracts/app-ui-model";
import { verifyUIProject } from "../scripts/verify-ui";
import {
  GENERATED_PLUGIN_REGISTRY_PATH,
  PLUGIN_REGISTRY_ENTRY_PATH,
  PLUGIN_REGISTRY_ENTRY_SOURCE,
} from "../scripts/ui-project/registry-generator";
import { collectPluginProjectFacts, generatePluginRegistry } from "./legacy-project-paths";
import type { UIProjectControlConfig } from "../scripts/ui-project/types";

const temporaryProjects: string[] = [];
const fixtureConfig: UIProjectControlConfig = {
  catalogs: [],
  uiPackages: [],
  agentUI: { sourceRoot: "agent-ui", metadataRoot: ".agent-ui" },
};
const dataMessageUIDefinition =
  'import { messageUI } from "./index";\nconst Component = () => null;\nexport default { manifest: {}, Component, dataMessageUIs: [messageUI] };\n';
const dataMessageUISource = (name: string) =>
  `import { defineDataMessageUI } from "@agent-ui/react";\nexport const messageUI = defineDataMessageUI({ name: ${JSON.stringify(name)}, render: () => null });\n`;

async function createProject(options: {
  instancePluginId: string;
  mounted: boolean;
  headless?: boolean;
  childSlots?: readonly string[];
  manifest?: Record<string, unknown>;
  pluginSource?: string;
  definitionSource?: string;
}): Promise<string> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "verify-agent-ui-"));
  temporaryProjects.push(projectRoot);
  await mkdir(path.join(projectRoot, "app-ui"));
  await mkdir(path.join(projectRoot, "plugins", "sample"), {
    recursive: true,
  });
  await writeFile(
    path.join(projectRoot, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        module: "ESNext",
        moduleResolution: "Bundler",
        target: "ES2022",
      },
      include: ["plugins/**/*.ts", "plugins/**/*.tsx", "services/**/*.ts"],
    }),
  );
  await writeFile(
    path.join(projectRoot, "plugins", "sample", "manifest.json"),
    JSON.stringify({
      id: "sample",
      name: "Sample",
      description: "Fixture",
      version: "1.0.0",
      capabilities: options.headless ? ["headless"] : ["visual"],
      ...(options.childSlots === undefined
        ? {}
        : {
            slots: {
              children: Object.fromEntries(options.childSlots.map((slot) => [
                slot,
                { description: `${slot} fixture Slot.`, cardinality: "many", optional: true },
              ])),
            },
          }),
      ...(options.manifest ?? {}),
    }),
  );
  await writeFile(
    path.join(projectRoot, "plugins", "sample", "definition.ts"),
    options.definitionSource ??
      "const Component = () => null;\nconst samplePlugin = { manifest: {}, Component };\nexport default samplePlugin;\n",
  );
  if (options.pluginSource !== undefined) {
    await writeFile(
      path.join(projectRoot, "plugins", "sample", "index.tsx"),
      options.pluginSource,
    );
  }
  const model: AppUIModel = {
    ...(options.mounted
      ? {}
      : {
          applicationPlugins: [{
            id: "sample-main",
            pluginId: options.instancePluginId,
            enabled: true,
          }],
        }),
    root: {
      type: "slot",
      plugins: options.mounted
        ? [{ id: "sample-main", pluginId: options.instancePluginId, enabled: true }]
        : [],
    },
  };
  await writeFile(
    path.join(projectRoot, "app-ui", "app-ui.json"),
    JSON.stringify(model),
  );
  const registry = await generatePluginRegistry(
    projectRoot,
    model,
    fixtureConfig,
  );
  await writeFile(
    path.join(projectRoot, GENERATED_PLUGIN_REGISTRY_PATH),
    registry.capabilityCatalog.source,
  );
  await writeFile(
    path.join(projectRoot, PLUGIN_REGISTRY_ENTRY_PATH),
    PLUGIN_REGISTRY_ENTRY_SOURCE,
  );
  return projectRoot;
}

async function addSecondDataMessageUI(
  projectRoot: string,
  enabled: boolean,
  name = "chart",
): Promise<void> {
  const pluginRoot = path.join(projectRoot, "plugins", "second");
  await mkdir(pluginRoot);
  await writeFile(path.join(pluginRoot, "manifest.json"), JSON.stringify({
    id: "second", name: "Second", description: "Fixture", version: "1.0.0",
    capabilities: ["visual"], data: { messageUI: true },
  }));
  await writeFile(path.join(pluginRoot, "definition.ts"), dataMessageUIDefinition);
  await writeFile(path.join(pluginRoot, "index.tsx"),
    'import { defineDataMessageUI as defineMessageUI } from "@agent-ui/react";\n' +
    `export const messageUI = defineMessageUI({ name: ${JSON.stringify(name)}, render: () => null });\n`);
  const model: AppUIModel = {
    applicationPlugins: [
      { id: "sample-main", pluginId: "sample", enabled: true },
      { id: "second-main", pluginId: "second", enabled },
    ],
    root: { type: "slot", plugins: [] },
  };
  await writeFile(path.join(projectRoot, "app-ui", "app-ui.json"), JSON.stringify(model));
  const registry = await generatePluginRegistry(projectRoot, model, fixtureConfig);
  await writeFile(path.join(projectRoot, GENERATED_PLUGIN_REGISTRY_PATH), registry.capabilityCatalog.source);
}

afterEach(async () => {
  await Promise.all(
    temporaryProjects.splice(0).map((projectRoot) =>
      rm(projectRoot, { recursive: true, force: true }),
    ),
  );
});

describe("verifyUIProject", () => {
  it("accepts an enabled Data Message UI without a mount or headless classification", async () => {
    const projectRoot = await createProject({
      instancePluginId: "sample", mounted: false,
      manifest: { data: { messageUI: true } },
      pluginSource: dataMessageUISource("chart"),
      definitionSource: dataMessageUIDefinition,
    });
    const result = await verifyUIProject(projectRoot, fixtureConfig);
    expect(result.status).toBe("passed");
    expect(result.activeComposition.headlessPluginIds).toEqual([]);
    expect(result.warnings).not.toContainEqual(
      expect.objectContaining({ code: "unmounted-enabled-instance" }),
    );
  });

  it("rejects a Data Message UI mounted in Layout", async () => {
    const projectRoot = await createProject({
      instancePluginId: "sample", mounted: true,
      manifest: { data: { messageUI: true } },
      pluginSource: dataMessageUISource("chart"),
      definitionSource: dataMessageUIDefinition,
    });
    const result = await verifyUIProject(projectRoot, fixtureConfig);
    expect(result.status).toBe("failed");
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: "data-message-ui-must-be-application",
    }));
  });

  it("rejects a declared Data Message UI without a renderer", async () => {
    const projectRoot = await createProject({
      instancePluginId: "sample", mounted: false,
      manifest: { data: { messageUI: true } },
    });
    const result = await verifyUIProject(projectRoot, fixtureConfig);
    expect(result.status).toBe("failed");
    expect(result.errors).toContainEqual(expect.objectContaining({ code: "DATA_MESSAGE_UI_RENDERER_MISSING" }));
  });

  it("does not count an unregistered renderer toward the manifest requirement", async () => {
    const projectRoot = await createProject({
      instancePluginId: "sample", mounted: false,
      manifest: { data: { messageUI: true } },
      pluginSource: dataMessageUISource("chart"),
      definitionSource: "export default { manifest: {}, Component: () => null, dataMessageUIs: [] };\n",
    });
    const result = await verifyUIProject(projectRoot, fixtureConfig);
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: "DATA_MESSAGE_UI_RENDERER_MISSING",
    }));
  });

  it("ignores an unregistered renderer when the manifest omits Data Message UI", async () => {
    const projectRoot = await createProject({
      instancePluginId: "sample", mounted: true,
      pluginSource: dataMessageUISource("chart"),
    });
    const result = await verifyUIProject(projectRoot, fixtureConfig);
    expect(result.errors.some((issue) => issue.code === "DATA_MESSAGE_UI_MANIFEST_MISSING"))
      .toBe(false);
  });

  it("rejects a renderer whose manifest omits Data Message UI", async () => {
    const projectRoot = await createProject({
      instancePluginId: "sample", mounted: true,
      pluginSource: dataMessageUISource("chart"),
      definitionSource: dataMessageUIDefinition,
    });
    const result = await verifyUIProject(projectRoot, fixtureConfig);
    expect(result.status).toBe("failed");
    expect(result.errors).toContainEqual(expect.objectContaining({ code: "DATA_MESSAGE_UI_MANIFEST_MISSING" }));
  });

  it.each(["", " chart "])("rejects invalid Data Message UI name %j", async (name) => {
    const projectRoot = await createProject({
      instancePluginId: "sample", mounted: false,
      manifest: { data: { messageUI: true } },
      pluginSource: dataMessageUISource(name),
      definitionSource: dataMessageUIDefinition,
    });
    const result = await verifyUIProject(projectRoot, fixtureConfig);
    expect(result.status).toBe("failed");
    expect(result.errors).toContainEqual(expect.objectContaining({ code: "DATA_MESSAGE_UI_INVALID_NAME" }));
  });

  it("rejects a dynamic Data Message UI name", async () => {
    const projectRoot = await createProject({
      instancePluginId: "sample", mounted: false,
      manifest: { data: { messageUI: true } },
      pluginSource: 'import { defineDataMessageUI } from "@agent-ui/react";\n' +
        'const name = getName();\nexport const messageUI = defineDataMessageUI({ name, render: () => null });\n',
      definitionSource: dataMessageUIDefinition,
    });
    const result = await verifyUIProject(projectRoot, fixtureConfig);
    expect(result.status).toBe("failed");
    expect(result.errors).toContainEqual(expect.objectContaining({ code: "DATA_MESSAGE_UI_NAME_NOT_STATIC" }));
  });

  it.each([
    { enabled: true, status: "failed", conflict: true },
    { enabled: false, status: "passed", conflict: false },
  ] as const)("checks duplicate names only for enabled instances: $enabled", async ({ enabled, status, conflict }) => {
    const projectRoot = await createProject({
      instancePluginId: "sample", mounted: false,
      manifest: { data: { messageUI: true } },
      pluginSource: dataMessageUISource("chart"),
      definitionSource: dataMessageUIDefinition,
    });
    await addSecondDataMessageUI(projectRoot, enabled);
    const result = await verifyUIProject(projectRoot, fixtureConfig);
    expect(result.status).toBe(status);
    expect(result.errors.some((issue) => issue.code === "DATA_MESSAGE_UI_NAME_CONFLICT")).toBe(conflict);
    if (conflict) {
      expect(result.errors.find((issue) => issue.code === "DATA_MESSAGE_UI_NAME_CONFLICT")?.message)
        .toContain('plugin "sample" instance "sample-main"');
    }
  });

  it("ignores unregistered names when checking enabled Plugin conflicts", async () => {
    const projectRoot = await createProject({
      instancePluginId: "sample", mounted: false,
      manifest: { data: { messageUI: true } },
      pluginSource: dataMessageUISource("chart") +
        'export const debugUI = defineDataMessageUI({ name: "debug", render: () => null });\n',
      definitionSource: dataMessageUIDefinition,
    });
    await addSecondDataMessageUI(projectRoot, true, "debug");
    const result = await verifyUIProject(projectRoot, fixtureConfig);
    expect(result.status).toBe("passed");
    expect(result.errors.some((issue) => issue.code === "DATA_MESSAGE_UI_NAME_CONFLICT"))
      .toBe(false);
  });

  it("extracts multiple registered names through imported symbols", async () => {
    const projectRoot = await createProject({
      instancePluginId: "sample", mounted: false,
      manifest: { data: { messageUI: true } },
      pluginSource: dataMessageUISource("chart") +
        'export const sourcesUI = defineDataMessageUI({ name: "sources", render: () => null });\n',
      definitionSource: 'import { messageUI, sourcesUI } from "./index";\n' +
        'export default { manifest: {}, Component: () => null, dataMessageUIs: [messageUI, sourcesUI] };\n',
    });
    const facts = await collectPluginProjectFacts(projectRoot, fixtureConfig);
    expect(facts.assets.find((asset) => asset.pluginId === "sample")?.dataMessageUINames)
      .toEqual(["chart", "sources"]);
  });

  it("resolves an inline renderer in the default definition", async () => {
    const projectRoot = await createProject({
      instancePluginId: "sample", mounted: false,
      manifest: { data: { messageUI: true } },
      definitionSource: 'import { defineDataMessageUI as defineMessageUI } from "@agent-ui/react";\n' +
        'export default { manifest: {}, Component: () => null, dataMessageUIs: [' +
        'defineMessageUI({ name: "chart", render: () => null })] };\n',
    });
    const result = await verifyUIProject(projectRoot, fixtureConfig);
    expect(result.status).toBe("passed");
  });

  it("reports a dynamic registration array explicitly", async () => {
    const projectRoot = await createProject({
      instancePluginId: "sample", mounted: false,
      manifest: { data: { messageUI: true } },
      definitionSource: 'export default { manifest: {}, Component: () => null, ' +
        'dataMessageUIs: createRenderers() };\n',
    });
    const result = await verifyUIProject(projectRoot, fixtureConfig);
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: "DATA_MESSAGE_UI_DEFINITION_NOT_STATIC",
    }));
  });

  it("ignores same-named functions from other packages", async () => {
    const projectRoot = await createProject({
      instancePluginId: "sample", mounted: false,
      manifest: { data: { messageUI: true } },
      pluginSource: 'import { defineDataMessageUI } from "other-package";\n' +
        'export const messageUI = defineDataMessageUI({ name: "chart", render: () => null });\n',
    });
    const result = await verifyUIProject(projectRoot, fixtureConfig);
    expect(result.errors).toContainEqual(expect.objectContaining({ code: "DATA_MESSAGE_UI_RENDERER_MISSING" }));
  });
  it("reports limited Creator readiness without failing verification", async () => {
    const projectRoot = await createProject({
      instancePluginId: "sample",
      mounted: true,
      manifest: {
        authoring: { intents: ["show the sample Plugin"] },
      },
    });

    const result = await verifyUIProject(projectRoot, fixtureConfig);

    expect(result.status).toBe("passed");
    expect(result.creatorReadiness.plugins).toContainEqual(
      expect.objectContaining({
        pluginId: "sample",
        status: "limited",
        discoverable: true,
        addRestore: "unavailable",
      }),
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: "CREATOR_ADD_RESTORE_UNAVAILABLE",
        pluginId: "sample",
      }),
    );
  });

  it("fails when a declared Creator default placement is invalid", async () => {
    const projectRoot = await createProject({
      instancePluginId: "sample",
      mounted: true,
      manifest: {
        authoring: {
          intents: ["show the sample Plugin"],
          defaultPlacement: {
            type: "plugin_slot",
            parentPluginId: "missing-parent",
            slot: "content",
          },
        },
      },
    });

    const result = await verifyUIProject(projectRoot, fixtureConfig);

    expect(result.status).toBe("failed");
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "CREATOR_DEFAULT_PLACEMENT_PARENT_NOT_FOUND",
        pluginId: "sample",
      }),
    );
  });

  it("rejects a visual plugin in application scope", async () => {
    const projectRoot = await createProject({
      instancePluginId: "sample",
      mounted: false,
    });

    const result = await verifyUIProject(projectRoot, fixtureConfig);

    expect(result.status).toBe("failed");
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "application-plugin-must-be-headless" }),
    );
  });

  it("allows an explicitly headless plugin in application scope", async () => {
    const projectRoot = await createProject({
      instancePluginId: "sample",
      mounted: false,
      headless: true,
    });

    const result = await verifyUIProject(projectRoot, fixtureConfig);

    expect(result.status).toBe("passed");
    expect(result.activeComposition.headlessPluginIds).toEqual(["sample"]);
    expect(result.capabilityCatalog.generatedFileFresh).toBe(true);
  });

  it("fails when an active Service Provider is dependency-blocked", async () => {
    const projectRoot = await createProject({
      instancePluginId: "sample",
      mounted: false,
      headless: true,
      definitionSource:
        "const Component = () => null;\n" +
        'const samplePlugin = { manifest: {}, provides: ["x"], inject: ["missing.service"], Component };\n' +
        "export default samplePlugin;\n",
    });

    const result = await verifyUIProject(projectRoot, fixtureConfig);

    expect(result.status).toBe("failed");
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "service-provider-dependency-blocked",
        service: "x",
      }),
    );
  });

  it("rejects plugin nodes whose plugin asset does not exist", async () => {
    const projectRoot = await createProject({
      instancePluginId: "missing",
      mounted: true,
    });

    const result = await verifyUIProject(projectRoot, fixtureConfig);

    expect(result.status).toBe("failed");
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "selected-plugin-asset-missing" }),
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "unresolved-plugin" }),
    );
  });

  it("reports a stale generated registry without modifying it", async () => {
    const projectRoot = await createProject({
      instancePluginId: "sample",
      mounted: true,
    });
    const registryPath = path.join(projectRoot, GENERATED_PLUGIN_REGISTRY_PATH);
    await writeFile(registryPath, "// stale\n");

    const result = await verifyUIProject(projectRoot, fixtureConfig);

    expect(result.status).toBe("failed");
    expect(result.capabilityCatalog.generatedFileFresh).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "plugin-registry-generated-stale" }),
    );
    expect(await readFile(registryPath, "utf8")).toBe("// stale\n");
  });

  it("rejects mount targets unreachable from the Layout-rooted composition", async () => {
    const projectRoot = await createProject({
      instancePluginId: "sample",
      mounted: true,
    });
    const modelPath = path.join(projectRoot, "app-ui", "app-ui.json");
    const model = JSON.parse(await readFile(modelPath, "utf8")) as AppUIModel;
    if (model.root.type !== "slot") throw new Error("fixture");
    model.root.plugins[0]!.slots = {
      missing: [{ id: "child-main", pluginId: "sample", enabled: true }],
    };
    await writeFile(modelPath, JSON.stringify(model));

    const result = await verifyUIProject(projectRoot, fixtureConfig);

    expect(result.status).toBe("failed");
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "plugin-slot-not-declared",
        instanceId: "sample-main",
      }),
    );
  });

  it("accepts matching manifest and rendered child Slots", async () => {
    const projectRoot = await createProject({
      instancePluginId: "sample",
      mounted: true,
      childSlots: ["sample.child"],
      pluginSource:
        'export function Sample({ renderSlot }) {\n  return renderSlot("sample.child");\n}\n',
    });

    const result = await verifyUIProject(projectRoot, fixtureConfig);

    expect(result.status).toBe("passed");
  });

  it("rejects child Slots declared by the manifest but not rendered", async () => {
    const projectRoot = await createProject({
      instancePluginId: "sample",
      mounted: true,
      childSlots: ["sample.child"],
      pluginSource: "export function Sample() { return null; }\n",
    });

    const result = await verifyUIProject(projectRoot, fixtureConfig);

    expect(result.status).toBe("failed");
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "plugin-child-slot-declared-not-rendered",
      }),
    );
  });

  it("rejects rendered child Slots missing from the manifest", async () => {
    const projectRoot = await createProject({
      instancePluginId: "sample",
      mounted: true,
      pluginSource:
        'export function Sample(props) {\n  return props.renderSlot("sample.child");\n}\n',
    });

    const result = await verifyUIProject(projectRoot, fixtureConfig);

    expect(result.status).toBe("failed");
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "plugin-child-slot-rendered-not-declared",
      }),
    );
  });

  it("rejects dynamic child Slot identifiers", async () => {
    const projectRoot = await createProject({
      instancePluginId: "sample",
      mounted: true,
      pluginSource:
        "export function Sample({ renderSlot, slotId }) {\n  return renderSlot(slotId);\n}\n",
    });

    const result = await verifyUIProject(projectRoot, fixtureConfig);

    expect(result.status).toBe("failed");
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "plugin-child-slot-dynamic-render-unsupported",
      }),
    );
  });

  it("rejects rendering a content Slot as a scoped renderer", async () => {
    const projectRoot = await createProject({
      instancePluginId: "sample",
      mounted: true,
      childSlots: ["sample.child"],
      pluginSource:
        'export function Sample({ renderScopedSlot }) { return renderScopedSlot("sample.child", { kind: "sample", value: 1 }); }\n',
    });
    const result = await verifyUIProject(projectRoot, fixtureConfig);
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: "plugin-child-slot-mode-mismatch",
    }));
  });
});
