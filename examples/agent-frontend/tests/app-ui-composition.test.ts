import { describe, expect, it } from "vitest";

import {
  validateAppUIComposition,
  type PluginSlotCatalog,
} from "../framework/contracts/app-ui-composition";
import type { AppUIModel, PluginInstance } from "../framework/contracts/app-ui-model";

function createModel(
  pluginInstances: Record<string, PluginInstance>,
  layoutSlotIds: readonly string[] = ["root"],
): AppUIModel {
  return {
    version: "2",
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
): PluginInstance {
  return { id, pluginId, enabled, mount: { slotId } };
}

describe("AppUIModel composition", () => {
  it("allows Layout mounts and one-level child Slot mounts", () => {
    const model = createModel({
      owner: mounted("owner", "owner-plugin", "root"),
      consumer: mounted("consumer", "consumer-plugin", "owner.child"),
    });
    const catalog: PluginSlotCatalog = {
      "owner-plugin": ["owner.child"],
      "consumer-plugin": [],
    };

    expect(() => validateAppUIComposition(model, catalog)).not.toThrow();
  });

  it("reaches multi-level child Slots by fixed point", () => {
    const model = createModel({
      // Consumer-first ordering must not affect reachability.
      c: mounted("c", "plugin-c", "b.child"),
      b: mounted("b", "plugin-b", "a.child"),
      a: mounted("a", "plugin-a", "root"),
    });

    expect(() =>
      validateAppUIComposition(model, {
        "plugin-a": ["a.child"],
        "plugin-b": ["b.child"],
        "plugin-c": [],
      }),
    ).not.toThrow();
  });

  it("rejects orphan mounts and includes the instance and Slot ids", () => {
    expect(() =>
      validateAppUIComposition(
        createModel({
          orphan: mounted("orphan", "orphan-plugin", "missing.child"),
        }),
        { "orphan-plugin": [] },
      ),
    ).toThrow(
      'Plugin instance "orphan" mount Slot "missing.child" is not reachable',
    );
  });

  it("rejects a rootless composition cycle", () => {
    const model = createModel({
      a: mounted("a", "plugin-a", "b.child"),
      b: mounted("b", "plugin-b", "a.child"),
    });

    expect(() =>
      validateAppUIComposition(model, {
        "plugin-a": ["a.child"],
        "plugin-b": ["b.child"],
      }),
    ).toThrow('Plugin instance "a" mount Slot "b.child" is not reachable');
  });

  it("rejects duplicate child Slot ownership by reachable instances", () => {
    const model = createModel(
      {
        first: mounted("first", "first-owner", "root.a"),
        second: mounted("second", "second-owner", "root.b"),
      },
      ["root.a", "root.b"],
    );

    expect(() =>
      validateAppUIComposition(model, {
        "first-owner": ["shared.child"],
        "second-owner": ["shared.child"],
      }),
    ).toThrow(
      'Plugin instance "second" declares child Slot "shared.child", which is already owned by reachable instance "first"',
    );
  });

  it("rejects collisions between Layout and reachable child Slots", () => {
    expect(() =>
      validateAppUIComposition(
        createModel(
          { owner: mounted("owner", "owner-plugin", "root") },
          ["root", "shared"],
        ),
        { "owner-plugin": ["shared"] },
      ),
    ).toThrow(
      'Plugin instance "owner" declares child Slot "shared", which collides with a Layout Slot',
    );
  });

  it("validates disabled instances and only exposes children from reachable owners", () => {
    const disabledOrphan = createModel({
      disabled: mounted("disabled", "owner-plugin", "missing.child", false),
    });
    expect(() =>
      validateAppUIComposition(disabledOrphan, {
        "owner-plugin": ["owner.child"],
      }),
    ).toThrow('Plugin instance "disabled" mount Slot "missing.child"');

    const unreachableOwner = createModel({
      owner: mounted("owner", "owner-plugin", "missing"),
      consumer: mounted("consumer", "consumer-plugin", "owner.child"),
    });
    expect(() =>
      validateAppUIComposition(unreachableOwner, {
        "owner-plugin": ["owner.child"],
        "consumer-plugin": [],
      }),
    ).toThrow('Plugin instance "consumer" mount Slot "owner.child"');
  });
});
