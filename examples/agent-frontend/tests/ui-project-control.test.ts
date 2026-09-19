import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { AppUIModel } from "../framework/contracts/app-ui-model";
import {
  handleUIProjectControlRequest,
  MAX_PLUGIN_SOURCE_CHARACTERS,
} from "../scripts/ui-project-control";
import {
  GENERATED_PLUGIN_REGISTRY_PATH,
  generatePluginRegistry,
  PLUGIN_REGISTRY_ENTRY_PATH,
  PLUGIN_REGISTRY_ENTRY_SOURCE,
} from "../scripts/ui-project/registry-generator";
import {
  resolveRuntimeLayoutSlotId,
  resolveRuntimePluginSlotId,
} from "../framework/contracts/app-ui-composition";
import type { UIProjectControlConfig } from "../scripts/ui-project/types";

const temporaryProjects: string[] = [];
const fixtureConfig: UIProjectControlConfig = {
  catalogs: [],
  uiPackages: ["react"],
  agentUI: { sourceRoot: "agent-ui", metadataRoot: ".agent-ui" },
};

async function createProject(
  definitionSource =
    "const Component = () => null;\nexport default { manifest: {}, Component };\n",
  manifestOverrides: Record<string, unknown> = {},
  modelOverride?: AppUIModel,
) {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "ui-control-"));
  temporaryProjects.push(projectRoot);
  await mkdir(path.join(projectRoot, "app-ui"));
  await mkdir(path.join(projectRoot, "plugins", "sample"), {
    recursive: true,
  });
  await writeFile(
    path.join(projectRoot, "package.json"),
    JSON.stringify({ dependencies: { react: "19.2.8" } }),
  );
  await writeFile(
    path.join(projectRoot, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        module: "ESNext",
        moduleResolution: "Bundler",
        target: "ES2022",
      },
      include: ["plugins/**/*.ts"],
    }),
  );
  await writeFile(
    path.join(projectRoot, "plugins", "sample", "manifest.json"),
    JSON.stringify({
      id: "sample",
      name: "Sample",
      description: "Fixture",
      version: "1.0.0",
      capabilities: ["visual"],
      ...manifestOverrides,
    }),
  );
  await writeFile(
    path.join(projectRoot, "plugins", "sample", "definition.ts"),
    definitionSource,
  );
  const model: AppUIModel = modelOverride ?? {
    root: {
      type: "slot",
      plugins: [{
        id: "sample-main",
        pluginId: "sample",
        enabled: true,
      }],
    },
  };
  const appUIModelSource = JSON.stringify(model, null, 2);
  await writeFile(
    path.join(projectRoot, "app-ui", "app-ui.json"),
    appUIModelSource,
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
  return {
    projectRoot,
    appUIModelSource,
    capabilityCatalogRevision: registry.capabilityCatalog.revision,
  };
}

function rowModel(instanceIds: readonly string[]): AppUIModel {
  return {
    root: {
      type: "row",
      sizes: instanceIds.map((_, index) => index === 0 ? "280px" : "1fr"),
      children: instanceIds.map((instanceId) => ({
        type: "panel" as const,
        child: {
          type: "slot" as const,
          plugins: [{
            id: `${instanceId}-main`,
            pluginId: instanceId,
            enabled: true,
          }],
        },
      })),
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

describe("ui-project-control", () => {
  it("returns the target-owned project inspection through the versioned protocol", async () => {
    const { projectRoot } = await createProject();

    const response = await handleUIProjectControlRequest(
      { schemaVersion: 3, operation: "inspect_ui_project", input: {} },
      projectRoot,
    );

    expect(response.ok).toBe(true);
    expect(response).toMatchObject({
      schemaVersion: 3,
      result: {
        appUIModel: {
          slots: [expect.objectContaining({ nodeRef: "l0" })],
        },
        capabilityCatalog: { generatedFileFresh: true },
      },
    });
  });

  it("returns the bounded authoritative Composition view", async () => {
    const { projectRoot, capabilityCatalogRevision } = await createProject();

    const response = await handleUIProjectControlRequest(
      {
        schemaVersion: 3,
        operation: "inspect_ui_project",
        input: { view: "composition" },
      },
      projectRoot,
    );

    expect(response).toMatchObject({
      ok: true,
      result: {
        view: "composition",
        appUIModel: {
          hash: expect.stringMatching(/^[a-f0-9]{64}$/u),
          slots: [expect.objectContaining({ nodeRef: "l0" })],
        },
        pluginInstances: [
          expect.objectContaining({
            id: "sample-main",
            pluginId: "sample",
            enabled: true,
            target: { type: "layout_slot", slotRef: "l0" },
          }),
        ],
        capabilitySummaries: [
          expect.objectContaining({
            pluginId: "sample",
            name: "Sample",
            description: "Fixture",
            selected: true,
          }),
        ],
        capabilityCatalogRevision,
      },
    });
    if (!response.ok) throw new Error("Expected successful Composition inspection.");
    expect(response.result).not.toHaveProperty("uiStack");
    expect(response.result).not.toHaveProperty("agentUI");
    expect(response.result).not.toHaveProperty("catalogs");
    expect(response.result).not.toHaveProperty("pluginAssets");
    expect(response.result).toHaveProperty("creatorActions.candidates");
    expect(response.result).not.toHaveProperty("creatorActions.bindings");
  });

  it("executes a Workspace Region Creator Action through the transaction Host", async () => {
    const model = rowModel(["history", "conversation"]);
    const { projectRoot } = await createProject({}, model, [
      ["history", {}],
      ["conversation", {}],
    ]);
    const inspection = await handleUIProjectControlRequest(
      {
        schemaVersion: 3,
        operation: "inspect_ui_project",
        input: { view: "composition" },
      },
      projectRoot,
    );
    if (!inspection.ok) throw new Error("Expected Composition inspection to succeed.");
    const composition = inspection.result as {
      appUIModel: { hash: string };
      creatorActions: {
        candidates: Array<{
          actionId: string;
          kind: string;
          status: string;
          target: { instanceId?: string };
          effect: { type: string; region?: string };
        }>;
      };
    };
    const action = composition.creatorActions.candidates.find(
      (candidate) => candidate.kind === "move_plugin" &&
        candidate.status === "ready" &&
        candidate.target.instanceId === "history-main" &&
        candidate.effect.type === "workspace_region" &&
        candidate.effect.region === "right",
    );
    if (action === undefined) throw new Error("Fixture did not produce a Workspace Region action.");

    const response = await handleUIProjectControlRequest(
      {
        schemaVersion: 3,
        operation: "mutate_app_ui_model",
        input: {
          appUIModelHash: composition.appUIModel.hash,
          operations: [{
            type: "execute_creator_action",
            actionId: action.actionId,
          }],
        },
      },
      projectRoot,
    );

    expect(response).toMatchObject({
      ok: true,
      result: {
        creatorAction: {
          actionId: action.actionId,
          actionKind: "move_plugin",
          status: "ready",
        },
        semanticComposition: {
          operation: "move_plugin_to",
          semanticLoweringSucceeded: true,
          expectedPlacement: {
            type: "relative",
            instanceId: "history-main",
            anchorInstanceId: "conversation-main",
            relation: "after",
          },
        },
      },
    });
    const written = JSON.parse(
      await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"),
    ) as AppUIModel;
    if (written.root.type !== "row") throw new Error("Fixture did not retain a Row root.");
    expect(written.root.children.map((child) =>
      child.type === "panel" && child.child.type === "slot"
        ? child.child.plugins[0]?.id
        : undefined,
    )).toEqual(["conversation-main", "history-main"]);
  });

  it("rejects an unknown Creator Action id at the Host boundary", async () => {
    const { projectRoot, appUIModelSource } = await createProject();
    const response = await handleUIProjectControlRequest(
      {
        schemaVersion: 3,
        operation: "mutate_app_ui_model",
        input: {
          appUIModelHash: createHash("sha256")
            .update(appUIModelSource)
            .digest("hex"),
          operations: [{
            type: "execute_creator_action",
            actionId: "act_unknown_creator_action",
          }],
        },
      },
      projectRoot,
    );

    expect(response).toMatchObject({
      ok: false,
      error: { code: "CREATOR_ACTION_NOT_AVAILABLE" },
    });
  });

  it("rejects execute_creator_action mixed with another transaction operation", async () => {
    const { projectRoot, appUIModelSource } = await createProject();
    const response = await handleUIProjectControlRequest(
      {
        schemaVersion: 3,
        operation: "mutate_app_ui_model",
        input: {
          appUIModelHash: createHash("sha256")
            .update(appUIModelSource)
            .digest("hex"),
          operations: [
            {
              type: "execute_creator_action",
              actionId: "act_unknown_creator_action",
            },
            {
              type: "set_plugin_enabled",
              instanceId: "sample-main",
              enabled: false,
            },
          ],
        },
      },
      projectRoot,
    );

    expect(response).toMatchObject({
      ok: false,
      error: { code: "CREATOR_ACTION_TRANSACTION_INVALID" },
    });
  });

  it("does not let an old Remove action delete a replacement instance", async () => {
    const { projectRoot } = await createProject();
    const inspection = await handleUIProjectControlRequest(
      {
        schemaVersion: 3,
        operation: "inspect_ui_project",
        input: { view: "composition" },
      },
      projectRoot,
    );
    if (!inspection.ok) throw new Error("Expected Composition inspection to succeed.");
    const composition = inspection.result as {
      appUIModel: { hash: string };
      creatorActions: {
        candidates: Array<{
          actionId: string;
          kind: string;
          status: string;
          target: { instanceId?: string };
          effect: { type: string };
        }>;
      };
    };
    const oldRemove = composition.creatorActions.candidates.find(
      (candidate) => candidate.kind === "remove_plugin" &&
        candidate.status === "ready" &&
        candidate.target.instanceId === "sample-main" &&
        candidate.effect.type === "remove",
    );
    if (oldRemove === undefined) throw new Error("Fixture did not produce a Remove action.");

    const replacement = await handleUIProjectControlRequest(
      {
        schemaVersion: 3,
        operation: "mutate_app_ui_model",
        input: {
          appUIModelHash: composition.appUIModel.hash,
          operations: [{
            type: "replace_plugin",
            instanceId: "sample-main",
            replacement: {
              id: "sample-replacement",
              pluginId: "sample",
              enabled: true,
            },
          }],
        },
      },
      projectRoot,
    );
    expect(replacement).toMatchObject({ ok: true });
    const replacedSource = await readFile(
      path.join(projectRoot, "app-ui", "app-ui.json"),
      "utf8",
    );

    const staleAction = await handleUIProjectControlRequest(
      {
        schemaVersion: 3,
        operation: "mutate_app_ui_model",
        input: {
          appUIModelHash: createHash("sha256")
            .update(replacedSource)
            .digest("hex"),
          operations: [{
            type: "execute_creator_action",
            actionId: oldRemove.actionId,
          }],
        },
      },
      projectRoot,
    );

    expect(staleAction).toMatchObject({
      ok: false,
      error: { code: "CREATOR_ACTION_NOT_AVAILABLE" },
    });
    expect(JSON.parse(replacedSource)).toMatchObject({
      root: {
        plugins: [{ id: "sample-replacement", pluginId: "sample" }],
      },
    });
  });

  it("returns the exact AppUIModel source and hash", async () => {
    const {
      projectRoot,
      appUIModelSource,
    } = await createProject();

    const response = await handleUIProjectControlRequest(
      { schemaVersion: 3, operation: "inspect_app_ui_model", input: {} },
      projectRoot,
    );

    expect(response.ok).toBe(true);
    expect(response).toMatchObject({
      result: {
        source: appUIModelSource,
        hash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      },
    });
  });

  it("includes canonical manifest descriptions when listing UI plugins", async () => {
    const { projectRoot } = await createProject();

    const response = await handleUIProjectControlRequest(
      { schemaVersion: 3, operation: "list_ui_plugins", input: {} },
      projectRoot,
    );

    expect(response).toMatchObject({
      ok: true,
      result: {
        pluginAssets: [
          expect.objectContaining({
            pluginId: "sample",
            name: "Sample",
            description: "Fixture",
          }),
        ],
      },
    });
  });

  it("returns authoring Slot targets and configured plugins", async () => {
    const { projectRoot, appUIModelSource } = await createProject();

    const response = await handleUIProjectControlRequest(
      {
        schemaVersion: 3,
        operation: "inspect_ui_slots",
        input: {
          appUIModelHash: createHash("sha256")
            .update(appUIModelSource)
            .digest("hex"),
          target: { type: "layout_slot", slotRef: "l0" },
        },
      },
      projectRoot,
    );

    expect(response).toMatchObject({
      ok: true,
      result: {
        slots: [
          expect.objectContaining({
            target: { type: "layout_slot", slotRef: "l0" },
            nodeRef: "l0",
            plugins: [
              expect.objectContaining({
                id: "sample-main",
                pluginId: "sample",
                enabled: true,
              }),
            ],
          }),
        ],
        selected: expect.objectContaining({
          target: { type: "layout_slot", slotRef: "l0" },
        }),
      },
    });
  });

  it("rejects stale layout Slot refs before interpreting the target", async () => {
    const { projectRoot, appUIModelSource } = await createProject();
    const staleHash = createHash("sha256")
      .update(appUIModelSource)
      .digest("hex");
    const changedSource = `${JSON.stringify({
      ...JSON.parse(appUIModelSource),
      root: {
        ...JSON.parse(appUIModelSource).root,
        plugins: [{ id: "sample-main", pluginId: "sample", enabled: false }],
      },
    }, null, 2)}\n`;
    await writeFile(
      path.join(projectRoot, "app-ui", "app-ui.json"),
      changedSource,
    );

    const staleResponse = await handleUIProjectControlRequest(
      {
        schemaVersion: 3,
        operation: "inspect_ui_slots",
        input: {
          appUIModelHash: staleHash,
          target: { type: "layout_slot", slotRef: "l0" },
        },
      },
      projectRoot,
    );

    expect(staleResponse).toMatchObject({
      ok: false,
      error: { code: "APP_UI_MODEL_HASH_CONFLICT" },
    });

    const freshResponse = await handleUIProjectControlRequest(
      {
        schemaVersion: 3,
        operation: "inspect_ui_slots",
        input: {
          appUIModelHash: createHash("sha256")
            .update(changedSource)
            .digest("hex"),
          target: { type: "layout_slot", slotRef: "l0" },
        },
      },
      projectRoot,
    );
    expect(freshResponse).toMatchObject({
      ok: true,
      result: {
        selected: { target: { type: "layout_slot", slotRef: "l0" } },
      },
    });
  });

  it("keeps plugin child Slot inspection independent of layout hashes", async () => {
    const { projectRoot } = await createProject(undefined, {
      slots: {
        children: {
          message: {
            description: "Message content.",
            cardinality: "many",
            optional: true,
          },
        },
      },
    });

    const response = await handleUIProjectControlRequest(
      {
        schemaVersion: 3,
        operation: "inspect_ui_slots",
        input: {
          target: {
            type: "plugin_slot",
            parentInstanceId: "sample-main",
            slot: "message",
          },
        },
      },
      projectRoot,
    );

    expect(response).toMatchObject({
      ok: true,
      result: {
        selected: {
          target: {
            type: "plugin_slot",
            parentInstanceId: "sample-main",
            slot: "message",
          },
        },
      },
    });
  });

  it("verifies Runtime composition in authoring terms for Layout Slots", async () => {
    const {
      projectRoot,
      appUIModelSource,
      capabilityCatalogRevision,
    } = await createProject();
    const appUIModelHash = createHash("sha256")
      .update(appUIModelSource)
      .digest("hex");
    const response = await handleUIProjectControlRequest(
      {
        schemaVersion: 3,
        operation: "verify_runtime_composition",
        input: {
          appUIModelHash,
          composition: {
            schemaVersion: 1,
            appUIModelHash,
            compositionRevision: `manual:${appUIModelHash}:${capabilityCatalogRevision}`,
            capabilityCatalogRevision,
            publishedAt: "2026-09-15T00:00:00.000Z",
            observedAt: "2026-09-15T00:00:00.000Z",
            instances: [{
              instanceId: "sample-main",
              pluginId: "sample",
              slotId: resolveRuntimeLayoutSlotId("root"),
            }],
            slots: [],
          },
        },
      },
      projectRoot,
    );

    expect(response).toMatchObject({
      ok: true,
      result: {
        verified: true,
        checks: [{
          instanceId: "sample-main",
          status: "passed",
          expected: {
            pluginId: "sample",
            target: { type: "layout_slot", slotRef: "l0" },
          },
          actual: { mounted: true, pluginId: "sample" },
        }],
      },
    });
    expect(JSON.stringify(response)).not.toContain("slotId");

    const wrongPluginSlotResponse = await handleUIProjectControlRequest(
      {
        schemaVersion: 3,
        operation: "verify_runtime_composition",
        input: {
          appUIModelHash,
          composition: {
            schemaVersion: 1,
            appUIModelHash,
            compositionRevision: `manual:${appUIModelHash}:${capabilityCatalogRevision}`,
            capabilityCatalogRevision,
            publishedAt: "2026-09-15T00:00:00.000Z",
            observedAt: "2026-09-15T00:00:00.000Z",
            instances: [{
              instanceId: "child-main",
              pluginId: "sample",
              slotId: resolveRuntimePluginSlotId("sample-main", "other"),
            }],
            slots: [],
          },
        },
      },
      projectRoot,
    );
    expect(wrongPluginSlotResponse).toMatchObject({
      ok: true,
      result: { checks: [{ status: "slot-mismatch" }] },
    });
    expect(JSON.stringify(wrongPluginSlotResponse)).not.toContain("slotId");
  });

  it("reports missing, plugin-mismatch, and slot-mismatch without Runtime ids", async () => {
    const {
      projectRoot,
      appUIModelSource,
      capabilityCatalogRevision,
    } = await createProject();
    const appUIModelHash = createHash("sha256")
      .update(appUIModelSource)
      .digest("hex");
    const composition = (instances: Array<Record<string, string>>) => ({
      schemaVersion: 1,
      appUIModelHash,
      compositionRevision: `manual:${appUIModelHash}:${capabilityCatalogRevision}`,
      capabilityCatalogRevision,
      publishedAt: "2026-09-15T00:00:00.000Z",
      observedAt: "2026-09-15T00:00:00.000Z",
      instances,
      slots: [],
    });
    const request = (value: unknown) =>
      handleUIProjectControlRequest(
        {
          schemaVersion: 3,
          operation: "verify_runtime_composition",
          input: { appUIModelHash, composition: value },
        },
        projectRoot,
      );

    const missing = await request(composition([]));
    const pluginMismatch = await request(composition([{
      instanceId: "sample-main",
      pluginId: "other",
      slotId: resolveRuntimeLayoutSlotId("root"),
    }]));
    const slotMismatch = await request(composition([{
      instanceId: "sample-main",
      pluginId: "sample",
      slotId: "layout-slot:other",
    }]));

    expect(missing).toMatchObject({ ok: true, result: { checks: [{ status: "missing" }] } });
    expect(pluginMismatch).toMatchObject({ ok: true, result: { checks: [{ status: "plugin-mismatch" }] } });
    expect(slotMismatch).toMatchObject({ ok: true, result: { checks: [{ status: "slot-mismatch" }] } });
    expect(JSON.stringify({ missing, pluginMismatch, slotMismatch })).not.toContain("slotId");
  });

  it("verifies Plugin child Slots without exposing their Runtime ids", async () => {
    const model: AppUIModel = {
      root: {
        type: "slot",
        plugins: [{
          id: "sample-main",
          pluginId: "sample",
          enabled: true,
          slots: {
            content: [{ id: "child-main", pluginId: "sample", enabled: true }],
          },
        }],
      },
    };
    const {
      projectRoot,
      appUIModelSource,
      capabilityCatalogRevision,
    } = await createProject(
      undefined,
      {
        slots: {
          children: {
            content: {
              description: "Content.",
              cardinality: "many",
              optional: true,
            },
          },
        },
      },
      model,
    );
    const appUIModelHash = createHash("sha256")
      .update(appUIModelSource)
      .digest("hex");
    const response = await handleUIProjectControlRequest(
      {
        schemaVersion: 3,
        operation: "verify_runtime_composition",
        input: {
          appUIModelHash,
          composition: {
            schemaVersion: 1,
            appUIModelHash,
            compositionRevision: `manual:${appUIModelHash}:${capabilityCatalogRevision}`,
            capabilityCatalogRevision,
            publishedAt: "2026-09-15T00:00:00.000Z",
            observedAt: "2026-09-15T00:00:00.000Z",
            instances: [{
              instanceId: "child-main",
              pluginId: "sample",
              slotId: resolveRuntimePluginSlotId("sample-main", "content"),
            }],
            slots: [],
          },
        },
      },
      projectRoot,
    );

    expect(response).toMatchObject({
      ok: true,
      result: {
        verified: true,
        checks: [{
          instanceId: "child-main",
          expected: {
            target: {
              type: "plugin_slot",
              parentInstanceId: "sample-main",
              slot: "content",
            },
          },
        }],
      },
    });
    expect(JSON.stringify(response)).not.toContain("slotId");
  });

  it("rejects stale AppUIModel hashes before Runtime comparison", async () => {
    const {
      projectRoot,
      appUIModelSource,
      capabilityCatalogRevision,
    } = await createProject();
    const staleHash = createHash("sha256")
      .update(appUIModelSource)
      .digest("hex");
    await writeFile(
      path.join(projectRoot, "app-ui", "app-ui.json"),
      `${JSON.stringify({
        ...JSON.parse(appUIModelSource),
        root: {
          ...JSON.parse(appUIModelSource).root,
          plugins: [{ id: "sample-main", pluginId: "sample", enabled: false }],
        },
      }, null, 2)}\n`,
    );

    const response = await handleUIProjectControlRequest(
      {
        schemaVersion: 3,
        operation: "verify_runtime_composition",
        input: {
          appUIModelHash: staleHash,
          composition: {
            schemaVersion: 1,
            appUIModelHash: staleHash,
            compositionRevision: `manual:${staleHash}:${capabilityCatalogRevision}`,
            capabilityCatalogRevision,
            publishedAt: "2026-09-15T00:00:00.000Z",
            observedAt: "2026-09-15T00:00:00.000Z",
            instances: [],
            slots: [],
          },
        },
      },
      projectRoot,
    );

    expect(response).toMatchObject({
      ok: false,
      error: { code: "APP_UI_MODEL_HASH_CONFLICT" },
    });
  });

  it("routes a hash-bound semantic mutation through the fixed protocol", async () => {
    const { projectRoot, appUIModelSource } = await createProject();

    const response = await handleUIProjectControlRequest(
      {
        schemaVersion: 3,
        operation: "mutate_app_ui_model",
        input: {
          appUIModelHash: createHash("sha256")
            .update(appUIModelSource)
            .digest("hex"),
          operations: [
            {
              type: "set_plugin_enabled",
              instanceId: "sample-main",
              enabled: false,
            },
          ],
        },
      },
      projectRoot,
    );

    expect(response).toMatchObject({
      ok: true,
      result: {
        changedPaths: ["app-ui/app-ui.json"],
        diff: { plugins: { updated: ["sample-main"] } },
      },
    });
    expect(
      await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"),
    ).toContain("Updated through control");
  });

  it("bounds plugin source while preserving precise asset and instance metadata", async () => {
    const source = `export default {};\n${"// detail\n".repeat(
      MAX_PLUGIN_SOURCE_CHARACTERS,
    )}`;
    const { projectRoot } = await createProject(source);

    const response = await handleUIProjectControlRequest(
      {
        schemaVersion: 3,
        operation: "inspect_ui_plugin",
        input: { pluginId: "sample" },
      },
      projectRoot,
    );

    expect(response.ok).toBe(true);
    expect(response).toMatchObject({
      result: {
        selected: true,
        asset: { pluginId: "sample" },
        instances: [expect.objectContaining({ id: "sample-main" })],
        definitionSource: {
          truncated: true,
          content: expect.any(String),
        },
      },
    });
  });

  it("returns a Plugin Service dependency summary", async () => {
    const { projectRoot } = await createProject(
      "const REQUIRED = \"workspace.files\" as const;\n" +
        "const OPTIONAL = \"agent-ui.theme\" as const;\n" +
        "const Component = () => null;\n" +
        "export default { manifest: {}, inject: [REQUIRED], optionalInject: [OPTIONAL], Component };\n",
    );

    const response = await handleUIProjectControlRequest(
      {
        schemaVersion: 3,
        operation: "inspect_ui_plugin",
        input: { pluginId: "sample" },
      },
      projectRoot,
    );

    expect(response).toMatchObject({
      ok: true,
      result: {
        services: {
          provides: [],
          required: ["workspace.files"],
          optional: ["agent-ui.theme"],
        },
      },
    });
  });

  it("routes the complete Service topology inspection", async () => {
    const { projectRoot } = await createProject(
      "const OPTIONAL = \"agent-ui.theme\" as const;\n" +
        "const Component = () => null;\n" +
        "export default { manifest: {}, optionalInject: [OPTIONAL], Component };\n",
    );

    const response = await handleUIProjectControlRequest(
      { schemaVersion: 3, operation: "inspect_ui_services", input: {} },
      projectRoot,
    );

    expect(response).toMatchObject({
      ok: true,
      result: {
        services: [
          expect.objectContaining({
            name: "agent-ui.theme",
            status: "optional-unavailable",
          }),
        ],
        plugins: [
          expect.objectContaining({
            pluginId: "sample",
            optionalInject: ["agent-ui.theme"],
          }),
        ],
        issues: [],
      },
    });
  });

  it("routes target-owned plugin source reference analysis", async () => {
    const { projectRoot } = await createProject();
    await mkdir(path.join(projectRoot, "plugins", "consumer"));
    await writeFile(
      path.join(projectRoot, "plugins", "consumer", "index.ts"),
      'import sample from "../sample/definition";\nexport { sample };\n',
    );

    const response = await handleUIProjectControlRequest(
      {
        schemaVersion: 3,
        operation: "inspect_ui_plugin_source_references",
        input: { pluginId: "sample" },
      },
      projectRoot,
    );

    expect(response).toMatchObject({
      ok: true,
      result: {
        pluginId: "sample",
        directory: "sample",
        references: expect.arrayContaining([
          expect.objectContaining({
            path: "plugins/consumer/index.ts",
            kind: "module",
          }),
        ]),
      },
    });
  });

  it("reports incompatible requests and missing plugins as structured errors", async () => {
    const { projectRoot } = await createProject();

    const incompatible = await handleUIProjectControlRequest(
      { schemaVersion: 2, operation: "inspect_ui_project", input: {} },
      projectRoot,
    );
    const missing = await handleUIProjectControlRequest(
      {
        schemaVersion: 3,
        operation: "inspect_ui_plugin",
        input: { pluginId: "missing" },
      },
      projectRoot,
    );

    expect(incompatible).toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST" },
    });
    expect(missing).toMatchObject({
      ok: false,
      error: { code: "UI_PLUGIN_NOT_FOUND" },
    });
  });
});
