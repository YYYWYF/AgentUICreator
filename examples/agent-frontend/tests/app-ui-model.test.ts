import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  appUIModelSchema,
  parseAppUIModel,
  parseAppUIModelJson,
  type AppUIModel,
} from "../framework/contracts/app-ui-model";

function createMinimalModel(): AppUIModel {
  return {
    version: "2",
    root: {
      type: "slot",
      id: "main-slot-node",
      slotId: "main",
    },
    slots: {
      main: {
        id: "main",
        kind: "single",
        scope: "thread-maybe",
        description: "Primary conversation surface.",
        owner: { type: "layout", nodeId: "main-slot-node" },
        occupants: [{ instanceId: "chat-main" }],
      },
    },
    pluginInstances: {
      "chat-main": {
        id: "chat-main",
        pluginId: "chat",
        enabled: true,
      },
    },
  };
}

function issuePaths(input: unknown): PropertyKey[][] {
  const result = appUIModelSchema.safeParse(input);
  expect(result.success).toBe(false);
  return result.success ? [] : result.error.issues.map((issue) => issue.path);
}

describe("AppUIModel", () => {
  it("reads and validates the checked-in JSON model", async () => {
    const json = await readFile(
      new URL("../app-ui/app-ui.json", import.meta.url),
      "utf8",
    );

    const model = parseAppUIModelJson(json);

    expect(model.version).toBe("2");
    expect(model.root.type).toBe("row");
    expect(Object.keys(model.pluginInstances)).toEqual([
      "agent-theme-provider-main",
      "agent-new-conversation-main",
      "agent-theme-switch-main",
      "agent-welcome-main",
      "agent-messages-main",
      "agent-run-timeline-main",
      "agent-tool-detail-main",
      "agent-resources-main",
      "agent-prompts-main",
      "agent-sender-main",
      "agent-conversations-main",
    ]);
  });

  it("rejects malformed JSON", () => {
    expect(() => parseAppUIModelJson("{")).toThrow(SyntaxError);
  });

  it("rejects unsupported model versions", () => {
    const input = { ...createMinimalModel(), version: "1" };

    expect(() => parseAppUIModel(input)).toThrow();
  });

  it("requires plugin instance keys to match instance ids", () => {
    const input = createMinimalModel();
    input.pluginInstances["chat-main"] = {
      id: "other-id",
      pluginId: "chat",
      enabled: true,
    };

    expect(issuePaths(input)).toContainEqual([
      "pluginInstances",
      "chat-main",
      "id",
    ]);
  });

  it("rejects dangling plugin instance references", () => {
    const input = createMinimalModel();
    input.slots.main!.occupants = [{ instanceId: "missing-instance" }];

    expect(issuePaths(input)).toContainEqual([
      "slots",
      "main",
      "occupants",
      0,
      "instanceId",
    ]);
  });

  it("validates Slot cardinality, owner fallback, and nested scope", () => {
    const invalidList = createMinimalModel();
    invalidList.slots.main = {
      ...invalidList.slots.main!,
      kind: "list",
      occupants: [{ instanceId: "chat-main" }],
    };
    expect(issuePaths(invalidList)).toContainEqual([
      "slots",
      "main",
      "occupants",
      0,
    ]);

    const layoutFallback = createMinimalModel();
    layoutFallback.slots.main!.fallback = "owner";
    expect(issuePaths(layoutFallback)).toContainEqual([
      "slots",
      "main",
      "fallback",
    ]);

    const broadChild = createMinimalModel();
    broadChild.slots["chat.tools"] = {
      id: "chat.tools",
      kind: "single",
      scope: "root",
      description: "Nested tool fixture.",
      owner: {
        type: "plugin-instance",
        instanceId: "chat-main",
        outlet: "tools",
      },
      occupants: [],
    };
    expect(issuePaths(broadChild)).toContainEqual([
      "slots",
      "chat.tools",
      "scope",
    ]);
  });

  it("rejects duplicate node ids and repeated mounts", () => {
    const input: AppUIModel = {
      ...createMinimalModel(),
      root: {
        type: "row",
        id: "layout",
        children: [
          {
            type: "slot",
            id: "duplicate",
            slotId: "left",
          },
          {
            type: "slot",
            id: "duplicate",
            slotId: "right",
          },
        ],
      },
      slots: {
        left: {
          id: "left",
          kind: "single",
          scope: "root",
          description: "Left region.",
          owner: { type: "layout", nodeId: "duplicate" },
          occupants: [{ instanceId: "chat-main" }],
        },
        right: {
          id: "right",
          kind: "single",
          scope: "root",
          description: "Right region.",
          owner: { type: "layout", nodeId: "duplicate" },
          occupants: [{ instanceId: "chat-main" }],
        },
      },
    };

    const paths = issuePaths(input);
    expect(paths).toContainEqual(["root", "children", 1, "id"]);
    expect(paths).toContainEqual([
      "slots",
      "right",
      "occupants",
      0,
      "instanceId",
    ]);
  });

  it("requires one size for each row or column child", () => {
    const input: AppUIModel = {
      ...createMinimalModel(),
      root: {
        type: "row",
        id: "layout",
        sizes: [1, 1],
        children: [
          {
            type: "slot",
            id: "main-slot-node",
            slotId: "main",
          },
        ],
      },
    };

    expect(issuePaths(input)).toContainEqual(["root", "sizes"]);
  });

  it("requires Stack.active to reference a direct child", () => {
    const input: AppUIModel = {
      ...createMinimalModel(),
      root: {
        type: "stack",
        id: "main-stack",
        active: "missing-child",
        children: [
          {
            type: "slot",
            id: "main-slot-node",
            slotId: "main",
          },
        ],
      },
    };

    expect(issuePaths(input)).toContainEqual(["root", "active"]);
  });

  it("requires Panel minWidth to be no greater than maxWidth", () => {
    const input: AppUIModel = {
      ...createMinimalModel(),
      root: {
        type: "panel",
        id: "main-panel",
        minWidth: 400,
        maxWidth: 300,
        child: {
          type: "slot",
          id: "main-slot-node",
          slotId: "main",
        },
      },
    };

    expect(issuePaths(input)).toContainEqual(["root", "minWidth"]);
  });
});
