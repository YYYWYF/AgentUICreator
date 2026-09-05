import type {
  AgentConversation,
  AgentExecution,
  AgentMessage,
  AgentRunState,
} from "@agent-ui/runtime-core";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  parseUIPluginManifest,
  uiPluginManifestSchema,
  type UIPluginContext,
} from "../framework/contracts/ui-plugin";

describe("UIPluginManifest", () => {
  it("validates a manifest", () => {
    const manifest = parseUIPluginManifest({
      id: "file-preview",
      name: "File preview",
      description: "Displays the selected file",
      version: "1.0.0",
      capabilities: ["file-preview"],
      data: { messages: true, state: true },
    });

    expect(manifest.id).toBe("file-preview");
  });

  it("rejects duplicate capabilities", () => {
    const result = uiPluginManifestSchema.safeParse({
      id: "file-preview",
      name: "File preview",
      description: "Displays the selected file",
      version: "1.0.0",
      capabilities: ["file-preview", "file-preview"],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["capabilities", 1]);
    }
  });

  it("parses static child Slot contracts", () => {
    const manifest = parseUIPluginManifest({
      id: "conversation",
      name: "Conversation",
      description: "Owns the conversation surface",
      version: "1.0.0",
      slots: {
        children: ["owner.header", "owner.body"],
      },
    });

    expect(manifest.slots?.children).toEqual(["owner.header", "owner.body"]);
  });

  it("rejects blank and duplicate child Slot ids", () => {
    const blank = uiPluginManifestSchema.safeParse({
      id: "conversation",
      name: "Conversation",
      description: "Owns the conversation surface",
      version: "1.0.0",
      slots: { children: ["owner.header", " "] },
    });
    const duplicate = uiPluginManifestSchema.safeParse({
      id: "conversation",
      name: "Conversation",
      description: "Owns the conversation surface",
      version: "1.0.0",
      slots: { children: ["owner.body", "owner.body"] },
    });

    expect(blank.success).toBe(false);
    if (!blank.success) {
      expect(blank.error.issues[0]?.path).toEqual(["slots", "children", 1]);
    }
    expect(duplicate.success).toBe(false);
    if (!duplicate.success) {
      expect(duplicate.error.issues[0]?.path).toEqual(["slots", "children", 1]);
    }
  });

  it("exposes frontend-owned messages in the plugin context", () => {
    expectTypeOf<UIPluginContext["messages"]>().toEqualTypeOf<AgentMessage[]>();
    expectTypeOf<UIPluginContext["conversation"]>()
      .toEqualTypeOf<AgentConversation>();
    expectTypeOf<UIPluginContext["run"]>().toEqualTypeOf<AgentRunState>();
    expectTypeOf<UIPluginContext["executions"]>()
      .toEqualTypeOf<AgentExecution[]>();
  });

  it("propagates application-owned state through the plugin context", () => {
    interface AppState {
      selectedFile: string;
    }

    expectTypeOf<UIPluginContext<AppState>["state"]>()
      .toEqualTypeOf<AppState>();
  });
});
