import type {
  AgentConversation,
  AgentExecution,
  AgentInterrupt,
  AgentMessage,
  AgentRunState,
} from "@agent-ui/runtime-core";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  parseUIPluginManifest,
  uiPluginManifestSchema,
} from "../framework/contracts/ui-plugin";
import {
  useAgentConversation,
  useAgentExecutions,
  useAgentInterrupts,
  useAgentMessages,
  useAgentRun,
  useAgentState,
  usePluginEvents,
} from "../runtime/context";

describe("UIPluginManifest", () => {
  it.each(["narrow", "wide"] as const)(
    "accepts the %s width requirement",
    (width) => {
      const manifest = parseUIPluginManifest({
        id: "file-preview",
        name: "File preview",
        description: "Displays the selected file",
        version: "1.0.0",
        layout: { width },
      });

      expect(manifest.layout?.width).toBe(width);
    },
  );

  it("rejects unsupported width requirements", () => {
    expect(() =>
      parseUIPluginManifest({
        id: "file-preview",
        name: "File preview",
        description: "Displays the selected file",
        version: "1.0.0",
        layout: { width: "medium" },
      }),
    ).toThrow();
  });

  it("validates a manifest", () => {
    const manifest = parseUIPluginManifest({
      id: "file-preview",
      name: "File preview",
      description: "Displays the selected file",
      version: "1.0.0",
      capabilities: ["file-preview"],
      data: {
        messages: true,
        state: true,
        events: ["workspace.patch.applied"],
      },
    });

    expect(manifest.id).toBe("file-preview");
    expect(manifest.data?.events).toEqual(["workspace.patch.applied"]);
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

  it("parses an Application Gate declaration", () => {
    const manifest = parseUIPluginManifest({
      id: "auth-login",
      name: "Authentication",
      description: "Blocks the Workspace until authentication is ready",
      version: "1.0.0",
      application: {
        gate: { service: "auth.gate", priority: 100 },
      },
    });

    expect(manifest.application?.gate).toEqual({
      service: "auth.gate",
      priority: 100,
    });
  });

  it("rejects a duplicate app-gate capability declaration", () => {
    const result = uiPluginManifestSchema.safeParse({
      id: "auth-login",
      name: "Authentication",
      description: "Blocks the Workspace until authentication is ready",
      version: "1.0.0",
      capabilities: ["app-gate"],
      application: { gate: { service: "auth.gate" } },
    });

    expect(result.success).toBe(false);
  });

  it("rejects duplicate application event declarations", () => {
    const result = uiPluginManifestSchema.safeParse({
      id: "file-preview",
      name: "File preview",
      description: "Displays the selected file",
      version: "1.0.0",
      data: {
        events: [
          "workspace.patch.applied",
          "workspace.patch.applied",
        ],
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["data", "events", 1]);
    }
  });

  it("preserves valid application-owned Custom Event names", () => {
    const manifest = parseUIPluginManifest({
      id: "file-preview",
      name: "File preview",
      description: "Displays the selected file",
      version: "1.0.0",
      data: { events: ["OrderCreated", "订单创建"] },
    });

    expect(manifest.data?.events).toEqual(["OrderCreated", "订单创建"]);
  });

  it("rejects reserved Custom Event names", () => {
    const result = uiPluginManifestSchema.safeParse({
      id: "file-preview",
      name: "File preview",
      description: "Displays the selected file",
      version: "1.0.0",
      data: { events: ["run.finished"] },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["data", "events", 0]);
      expect(result.error.issues[0]?.message)
        .toContain("reserved Agent Runtime namespace");
    }
  });

  it.each(["", " event.created", "event.created ", "event\u0000created"])(
    "rejects the invalid manifest Custom Event name %j",
    (name) => {
      const result = uiPluginManifestSchema.safeParse({
        id: "file-preview",
        name: "File preview",
        description: "Displays the selected file",
        version: "1.0.0",
        data: { events: [name] },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.path).toEqual(["data", "events", 0]);
      }
    },
  );

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

  it("exposes frontend-owned runtime semantics through domain hooks", () => {
    expectTypeOf(useAgentMessages).returns.toEqualTypeOf<AgentMessage[]>();
    expectTypeOf(useAgentConversation).returns
      .toEqualTypeOf<AgentConversation>();
    expectTypeOf(useAgentRun).returns.toEqualTypeOf<AgentRunState>();
    expectTypeOf(useAgentExecutions).returns
      .toEqualTypeOf<AgentExecution[]>();
    expectTypeOf(useAgentInterrupts).returns
      .toEqualTypeOf<AgentInterrupt[]>();
    expectTypeOf<ReturnType<typeof usePluginEvents>["subscribe"]>().toBeFunction();
  });

  it("propagates application-owned state through the state hook", () => {
    interface AppState {
      selectedFile: string;
    }

    expectTypeOf(useAgentState<AppState>).returns.toEqualTypeOf<AppState>();
  });
});
