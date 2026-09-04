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
    pluginInstances: {
      "chat-main": {
        id: "chat-main",
        pluginId: "chat",
        enabled: true,
        mount: { slotId: "main" },
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
      "agent-conversation-surface-main",
      "agent-welcome-main",
      "agent-messages-main",
      "agent-inspector-main",
      "agent-run-timeline-main",
      "agent-tool-detail-main",
      "agent-resources-main",
      "agent-prompts-main",
      "agent-sender-main",
      "agent-conversations-main",
    ]);
    expect(model.root).toMatchObject({
      type: "row",
      children: [
        {},
        {},
        {
          type: "column",
          id: "agent-inspector",
          children: [
            {
              type: "slot",
              id: "workspace-inspector-slot-node",
              slotId: "workspace.inspector",
            },
          ],
          sizes: ["minmax(0, 1fr)"],
        },
      ],
    });
    expect(model.pluginInstances["agent-inspector-main"]?.mount).toEqual({
      slotId: "workspace.inspector",
    });
    expect(model.pluginInstances["agent-run-timeline-main"]?.mount).toEqual({
      slotId: "inspector.activity",
    });
    expect(model.pluginInstances["agent-tool-detail-main"]?.mount).toEqual({
      slotId: "inspector.tool",
    });
    expect(model.pluginInstances["agent-resources-main"]?.mount).toEqual({
      slotId: "inspector.resources",
    });
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

  it("leaves cross-manifest mount reachability to composition validation", () => {
    for (const enabled of [true, false]) {
      const input = createMinimalModel();
      input.pluginInstances["chat-main"]!.enabled = enabled;
      input.pluginInstances["chat-main"]!.mount = { slotId: "missing" };
      expect(parseAppUIModel(input).pluginInstances["chat-main"]?.mount).toEqual({
        slotId: "missing",
      });
    }
  });

  it("allows multiple mounts in one Slot and instances without an ordinary mount", () => {
    const input = createMinimalModel();
    input.pluginInstances.second = { id: "second", pluginId: "chat", enabled: true, mount: { slotId: "main", order: -2 } };
    input.pluginInstances.unmounted = { id: "unmounted", pluginId: "chat", enabled: true };
    expect(parseAppUIModel(input).pluginInstances.second?.mount).toEqual({ slotId: "main", order: -2 });
  });

  it("rejects blank mount targets and non-finite orders", () => {
    for (const mount of [{ slotId: " " }, { slotId: "main", order: Infinity }]) {
      const input = createMinimalModel();
      input.pluginInstances["chat-main"]!.mount = mount;
      expect(() => parseAppUIModel(input)).toThrow();
    }
  });

  it("rejects duplicate node ids and duplicate Layout slot ids", () => {
    const input = createMinimalModel();
    input.root = {
      type: "row",
      id: "layout",
      children: [
        { type: "slot", id: "duplicate", slotId: "main" },
        { type: "slot", id: "duplicate", slotId: "main" },
      ],
    };
    const paths = issuePaths(input);
    expect(paths).toContainEqual(["root", "children", 1, "id"]);
    expect(paths).toContainEqual(["root", "children", 1, "slotId"]);
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
