import { describe, expect, it } from "vitest";

import {
  validateAppUIComposition,
  type PluginCompositionCatalog,
} from "../framework/contracts/app-ui-composition";
import type { AppUIRuntimeModel, AppUIRuntimePluginInstance } from "../framework/contracts/app-ui-runtime-model";

function createModel(
  pluginInstances: Record<string, AppUIRuntimePluginInstance>,
  layoutSlotIds: readonly string[] = ["root"],
): AppUIRuntimeModel {
  return {
    root:
      layoutSlotIds.length === 1
        ? {
            type: "slot",
            id: `${layoutSlotIds[0]}-node`,
            slotId: layoutSlotIds[0]!,
          }
        : {
            type: "row",
            id: "layout-root",
            children: layoutSlotIds.map((slotId) => ({
              type: "slot" as const,
              id: `${slotId}-node`,
              slotId,
            })),
          },
    pluginInstances,
  };
}

function mounted(
  id: string,
  pluginId: string,
  slotId: string,
  enabled = true,
): AppUIRuntimePluginInstance {
  return { id, pluginId, enabled, mount: { slotId } };
}

function childSlots(...names: string[]) {
  return Object.fromEntries(names.map((name) => [
    name,
    {
      description: `${name} content.`,
      cardinality: "many" as const,
      optional: true,
    },
  ]));
}

describe("AppUIRuntimeModel composition", () => {
  it("allows Layout mounts and one-level child Slot mounts", () => {
    const model = createModel({
      owner: mounted("owner", "owner-plugin", "root"),
      consumer: mounted("consumer", "consumer-plugin", "plugin:owner:owner.child"),
    });
    const catalog: PluginCompositionCatalog = {
      "owner-plugin": { childSlots: childSlots("owner.child") },
      "consumer-plugin": {},
    };

    expect(() => validateAppUIComposition(model, catalog)).not.toThrow();
  });

  it("rejects a mounted Application Gate", () => {
    const model = createModel({
      gate: mounted("gate", "auth-gate", "root"),
    });

    expect(() =>
      validateAppUIComposition(model, {
        "auth-gate": {
          applicationGate: { service: "auth.gate", priority: 100 },
          provides: ["auth.gate"],
        },
      }),
    ).toThrow("must not mount");
  });

  it("rejects a mounted UI Provider in the Gate dependency closure", () => {
    const model = createModel({
      gate: { id: "gate", pluginId: "auth-gate", enabled: true },
      provider: mounted("provider", "visual-provider", "root"),
    });

    expect(() =>
      validateAppUIComposition(model, {
        "auth-gate": {
          applicationGate: { service: "auth.gate", priority: 100 },
          provides: ["auth.gate"],
          inject: ["secure-storage"],
        },
        "visual-provider": { provides: ["secure-storage"] },
      }),
    ).toThrow("must be an unmounted headless or Application Gate plugin");
  });

  it("reaches multi-level child Slots by fixed point", () => {
    const model = createModel({
      // Consumer-first ordering must not affect reachability.
      c: mounted("c", "plugin-c", "plugin:b:b.child"),
      b: mounted("b", "plugin-b", "plugin:a:a.child"),
      a: mounted("a", "plugin-a", "root"),
    });

    expect(() =>
      validateAppUIComposition(model, {
        "plugin-a": { childSlots: childSlots("a.child") },
        "plugin-b": { childSlots: childSlots("b.child") },
        "plugin-c": {},
      }),
    ).not.toThrow();
  });

  it("rejects orphan mounts and includes the instance and Slot ids", () => {
    expect(() =>
      validateAppUIComposition(
        createModel({
          orphan: mounted("orphan", "orphan-plugin", "missing.child"),
        }),
        { "orphan-plugin": {} },
      ),
    ).toThrow(
      'Plugin instance "orphan" mount Slot "missing.child" is not reachable',
    );
  });

  it("rejects a rootless composition cycle", () => {
    const model = createModel({
      a: mounted("a", "plugin-a", "plugin:b:b.child"),
      b: mounted("b", "plugin-b", "plugin:a:a.child"),
    });

    expect(() =>
      validateAppUIComposition(model, {
        "plugin-a": { childSlots: childSlots("a.child") },
        "plugin-b": { childSlots: childSlots("b.child") },
      }),
    ).toThrow('Plugin instance "a" mount Slot "plugin:b:b.child" is not reachable');
  });

  it("isolates the same local child Slot name for multiple instances", () => {
    const model = createModel(
      {
        first: mounted("first", "first-owner", "root.a"),
        second: mounted("second", "second-owner", "root.b"),
      },
      ["root.a", "root.b"],
    );

    expect(() =>
      validateAppUIComposition(model, {
        "first-owner": { childSlots: childSlots("shared.child") },
        "second-owner": { childSlots: childSlots("shared.child") },
      }),
    ).not.toThrow();
  });

  it("namespaces child Slots away from Layout Slots", () => {
    expect(() =>
      validateAppUIComposition(
        createModel(
          { owner: mounted("owner", "owner-plugin", "root") },
          ["root", "shared"],
        ),
        { "owner-plugin": { childSlots: childSlots("shared") } },
      ),
    ).not.toThrow();
  });

  it("validates disabled instances and only exposes children from reachable owners", () => {
    const disabledOrphan = createModel({
      disabled: mounted("disabled", "owner-plugin", "missing.child", false),
    });
    expect(() =>
      validateAppUIComposition(disabledOrphan, {
        "owner-plugin": { childSlots: childSlots("owner.child") },
      }),
    ).toThrow('Plugin instance "disabled" mount Slot "missing.child"');

    const unreachableOwner = createModel({
      owner: mounted("owner", "owner-plugin", "missing"),
      consumer: mounted("consumer", "consumer-plugin", "plugin:owner:owner.child"),
    });
    expect(() =>
      validateAppUIComposition(unreachableOwner, {
        "owner-plugin": { childSlots: childSlots("owner.child") },
        "consumer-plugin": {},
      }),
    ).toThrow('Plugin instance "consumer" mount Slot "plugin:owner:owner.child"');
  });
});
