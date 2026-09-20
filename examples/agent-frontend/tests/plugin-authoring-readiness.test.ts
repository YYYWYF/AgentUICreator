import { describe, expect, it } from "vitest";

import type {
  PluginChildSlotDefinition,
} from "../framework/contracts/app-ui-composition";
import type {
  UIPluginManifest,
} from "../framework/contracts/ui-plugin";
import { analyzePluginAuthoringReadiness } from "../scripts/ui-project/plugin-authoring-readiness";
import type { PluginAsset } from "../scripts/ui-project/types";

function slot(
  options: {
    mode?: "content" | "renderer";
    accepts?: readonly string[];
  } = {},
): PluginChildSlotDefinition {
  return {
    description: "Fixture child Slot.",
    cardinality: "one",
    ...(options.mode === undefined ? {} : { mode: options.mode }),
    ...(options.accepts === undefined
      ? {}
      : { accepts: { anyOfCapabilities: options.accepts } }),
  };
}

function asset(
  pluginId: string,
  options: {
    capabilities?: string[];
    authoring?: UIPluginManifest["authoring"];
    requiresRenderScope?: boolean;
    applicationGate?: boolean;
    childSlots?: Record<string, PluginChildSlotDefinition>;
  } = {},
): PluginAsset {
  const manifest: UIPluginManifest = {
    id: pluginId,
    name: pluginId,
    description: "Fixture Plugin.",
    version: "1.0.0",
    ...(options.capabilities === undefined
      ? {}
      : { capabilities: options.capabilities }),
    ...(options.requiresRenderScope === undefined
      ? {}
      : { requiresRenderScope: options.requiresRenderScope }),
    ...(options.authoring === undefined
      ? {}
      : { authoring: options.authoring }),
    ...(options.applicationGate === true
      ? { application: { gate: { service: `${pluginId}.gate` } } }
      : {}),
    ...(options.childSlots === undefined
      ? {}
      : { slots: { children: options.childSlots } }),
  };
  return {
    pluginId,
    manifest,
    name: pluginId,
    description: "Fixture Plugin.",
    directory: pluginId,
    manifestPath: `plugins/${pluginId}/manifest.json`,
    definitionPath: `plugins/${pluginId}/definition.ts`,
    capabilities: [...(options.capabilities ?? [])],
    ...(options.authoring === undefined
      ? {}
      : { authoring: options.authoring }),
    ...(options.applicationGate === true
      ? { applicationGate: { service: `${pluginId}.gate`, priority: 0 } }
      : {}),
    ...(options.childSlots === undefined
      ? {}
      : { childSlots: options.childSlots }),
  };
}

function analyze(assets: readonly PluginAsset[]) {
  return analyzePluginAuthoringReadiness(assets);
}

function readiness(result: ReturnType<typeof analyze>, pluginId: string) {
  return result.plugins.find((plugin) => plugin.pluginId === pluginId);
}

describe("Plugin Creator Authoring Readiness", () => {
  it("classifies a visual Plugin without authoring as manual-only", () => {
    const result = analyze([asset("manual-plugin", { capabilities: ["visual"] })]);

    expect(readiness(result, "manual-plugin")).toEqual({
      pluginId: "manual-plugin",
      status: "manual-only",
      discoverable: false,
      addRestore: "unavailable",
      reasons: [],
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("reports authoring without placement as limited and non-blocking", () => {
    const result = analyze([
      asset("discoverable-plugin", {
        capabilities: ["debug-panel"],
        authoring: { intents: ["show the debug panel"] },
      }),
    ]);

    expect(readiness(result, "discoverable-plugin")).toMatchObject({
      status: "limited",
      discoverable: true,
      addRestore: "unavailable",
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: "CREATOR_ADD_RESTORE_UNAVAILABLE",
        pluginId: "discoverable-plugin",
      }),
    );
  });

  it("accepts a valid plugin_slot placement", () => {
    const result = analyze([
      asset("container", {
        capabilities: ["container"],
        childSlots: {
          children: slot({ accepts: ["child-capability"] }),
        },
      }),
      asset("child", {
        capabilities: ["child-capability"],
        authoring: {
          intents: ["show the child"],
          defaultPlacement: {
            type: "plugin_slot",
            parentPluginId: "container",
            slot: "children",
          },
        },
      }),
    ]);

    expect(readiness(result, "child")).toMatchObject({
      status: "ready",
      discoverable: true,
      addRestore: "ready",
      reasons: [],
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("rejects missing plugin_slot parents and child Slots", () => {
    const missingParent = analyze([
      asset("child", {
        capabilities: ["child-capability"],
        authoring: {
          intents: ["show the child"],
          defaultPlacement: {
            type: "plugin_slot",
            parentPluginId: "missing-parent",
            slot: "children",
          },
        },
      }),
    ]);
    expect(missingParent.errors).toContainEqual(
      expect.objectContaining({
        code: "CREATOR_DEFAULT_PLACEMENT_PARENT_NOT_FOUND",
      }),
    );

    const missingSlot = analyze([
      asset("container", { capabilities: ["container"] }),
      asset("child", {
        capabilities: ["child-capability"],
        authoring: {
          intents: ["show the child"],
          defaultPlacement: {
            type: "plugin_slot",
            parentPluginId: "container",
            slot: "missing",
          },
        },
      }),
    ]);
    expect(missingSlot.errors).toContainEqual(
      expect.objectContaining({
        code: "CREATOR_DEFAULT_PLACEMENT_SLOT_NOT_FOUND",
      }),
    );
  });

  it("rejects child capability mismatches", () => {
    const result = analyze([
      asset("container", {
        capabilities: ["container"],
        childSlots: { children: slot({ accepts: ["expected-capability"] }) },
      }),
      asset("child", {
        capabilities: ["other-capability"],
        authoring: {
          intents: ["show the child"],
          defaultPlacement: {
            type: "plugin_slot",
            parentPluginId: "container",
            slot: "children",
          },
        },
      }),
    ]);

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "CREATOR_DEFAULT_PLACEMENT_CAPABILITY_MISMATCH",
      }),
    );
  });

  it("requires renderer mode agreement in both directions", () => {
    const rendererToContent = analyze([
      asset("container", {
        childSlots: { content: slot({ accepts: ["renderer"] }) },
      }),
      asset("renderer", {
        capabilities: ["renderer"],
        requiresRenderScope: true,
        authoring: {
          intents: ["show the renderer"],
          defaultPlacement: {
            type: "plugin_slot",
            parentPluginId: "container",
            slot: "content",
          },
        },
      }),
    ]);
    expect(rendererToContent.errors).toContainEqual(
      expect.objectContaining({
        code: "CREATOR_DEFAULT_PLACEMENT_RENDERER_MODE_MISMATCH",
      }),
    );

    const ordinaryToRenderer = analyze([
      asset("container", {
        childSlots: {
          renderer: slot({ mode: "renderer", accepts: ["ordinary"] }),
        },
      }),
      asset("ordinary", {
        capabilities: ["ordinary"],
        authoring: {
          intents: ["show the ordinary Plugin"],
          defaultPlacement: {
            type: "plugin_slot",
            parentPluginId: "container",
            slot: "renderer",
          },
        },
      }),
    ]);
    expect(ordinaryToRenderer.errors).toContainEqual(
      expect.objectContaining({
        code: "CREATOR_DEFAULT_PLACEMENT_RENDERER_MODE_MISMATCH",
      }),
    );
  });

  it("accepts valid renderer placements", () => {
    const result = analyze([
      asset("conversation-surface", {
        childSlots: {
          reasoning: slot({ mode: "renderer", accepts: ["reasoning"] }),
        },
      }),
      asset("assistant-ui-reasoning", {
        capabilities: ["reasoning"],
        requiresRenderScope: true,
        authoring: {
          intents: ["show the reasoning process"],
          defaultPlacement: {
            type: "plugin_slot",
            parentPluginId: "conversation-surface",
            slot: "reasoning",
          },
        },
      }),
    ]);

    expect(readiness(result, "assistant-ui-reasoning")).toMatchObject({
      status: "ready",
      addRestore: "ready",
    });
  });

  it("validates relative anchors and portable axis sizing", () => {
    const missingAnchor = analyze([
      asset("thread-list", {
        authoring: {
          intents: ["browse history"],
          defaultPlacement: {
            type: "relative",
            relation: "before",
            anchorPluginId: "missing",
          },
          recommendedSize: { width: "280px" },
        },
      }),
    ]);
    expect(missingAnchor.errors).toContainEqual(
      expect.objectContaining({
        code: "CREATOR_DEFAULT_PLACEMENT_ANCHOR_NOT_FOUND",
      }),
    );

    const missingSize = analyze([
      asset("conversation-surface"),
      asset("thread-list", {
        authoring: {
          intents: ["browse history"],
          defaultPlacement: {
            type: "relative",
            relation: "before",
            anchorPluginId: "conversation-surface",
          },
        },
      }),
    ]);
    expect(missingSize.errors).toEqual([]);
    expect(missingSize.warnings).toContainEqual(
      expect.objectContaining({
        code: "CREATOR_DEFAULT_PLACEMENT_SIZE_NOT_PORTABLE",
      }),
    );
    expect(readiness(missingSize, "thread-list")).toMatchObject({
      status: "limited",
    });
  });

  it("does not require placement for headless Plugins or Application Gates", () => {
    const result = analyze([
      asset("headless", {
        capabilities: ["headless"],
      }),
      asset("gate", { applicationGate: true }),
    ]);

    expect(readiness(result, "headless")).toMatchObject({
      status: "not-applicable",
      addRestore: "not-applicable",
    });
    expect(readiness(result, "gate")).toMatchObject({
      status: "not-applicable",
      addRestore: "not-applicable",
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("keeps the standard renderer and Thread List contracts ready", () => {
    const result = analyze([
      asset("conversation-surface", {
        childSlots: {
          reasoningGroup: slot({ mode: "renderer", accepts: ["reasoning"] }),
          toolGroup: slot({ mode: "renderer", accepts: ["tool-group"] }),
          toolFallback: slot({ mode: "renderer", accepts: ["tool-fallback"] }),
        },
      }),
      asset("assistant-ui-reasoning", {
        capabilities: ["reasoning"],
        requiresRenderScope: true,
        authoring: {
          intents: ["show reasoning"],
          defaultPlacement: {
            type: "plugin_slot",
            parentPluginId: "conversation-surface",
            slot: "reasoningGroup",
          },
        },
      }),
      asset("assistant-ui-tool-group", {
        capabilities: ["tool-group"],
        requiresRenderScope: true,
        authoring: {
          intents: ["show tools"],
          defaultPlacement: {
            type: "plugin_slot",
            parentPluginId: "conversation-surface",
            slot: "toolGroup",
          },
        },
      }),
      asset("assistant-ui-tool-fallback", {
        capabilities: ["tool-fallback"],
        requiresRenderScope: true,
        authoring: {
          intents: ["show fallback tools"],
          defaultPlacement: {
            type: "plugin_slot",
            parentPluginId: "conversation-surface",
            slot: "toolFallback",
          },
        },
      }),
      asset("conversation-surface-anchor"),
      asset("conversation-thread-list", {
        authoring: {
          intents: ["browse conversation history"],
          defaultPlacement: {
            type: "relative",
            relation: "before",
            anchorPluginId: "conversation-surface-anchor",
          },
          recommendedSize: { width: "300px" },
        },
      }),
    ]);

    for (const pluginId of [
      "assistant-ui-reasoning",
      "assistant-ui-tool-group",
      "assistant-ui-tool-fallback",
      "conversation-thread-list",
    ]) {
      expect(readiness(result, pluginId)).toMatchObject({
        status: "ready",
        addRestore: "ready",
      });
    }
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});
