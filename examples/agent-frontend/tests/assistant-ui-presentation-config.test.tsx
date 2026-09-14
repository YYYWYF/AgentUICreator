import { describe, expect, it } from "vitest";

import {
  resolveConversationPresentationConfig,
} from "../agent-ui/conversation/config";
import type { AppUIRuntimeModel } from "../framework/contracts/app-ui-runtime-model";

function createModel(
  conversationPresentation?: Record<string, unknown>,
): AppUIRuntimeModel {
  return {
    version: "2",
    root: {
      type: "slot",
      id: "assistant-ui-presentation-test-root",
      slotId: "conversation.surface",
    },
    pluginInstances: {
      "agent-conversation-surface-main": {
        id: "agent-conversation-surface-main",
        pluginId: "conversation-surface",
        enabled: true,
        mount: { slotId: "conversation.surface" },
        ...(conversationPresentation === undefined
          ? {}
          : { props: { conversationPresentation } }),
      },
    },
  };
}

describe("assistant-ui presentation config", () => {
  it("maps only the Welcome configuration", () => {
    expect(resolveConversationPresentationConfig(createModel({
      welcome: {
        title: "Agent Frontend",
        description: "Canonical assistant-ui presentation",
      },
      composer: {
        placeholder: "Ignored by the official Thread",
        quickPrompts: [{ label: "Ignored", value: "ignored" }],
      },
    }))).toEqual({
      welcome: {
        title: "Agent Frontend",
        description: "Canonical assistant-ui presentation",
      },
    });
  });

  it("does not expose the removed composer presentation contract", () => {
    const presentation = resolveConversationPresentationConfig(createModel({
      composer: {
        placeholder: "No longer supported by Thread",
        quickPrompts: [{ label: "No", value: "No" }],
      },
    }));

    expect(presentation).toEqual({
      welcome: {},
    });
    expect(presentation).not.toHaveProperty("composer");
  });

  it("fails closed to empty product configuration when the surface is absent", () => {
    expect(resolveConversationPresentationConfig(createModel())).toEqual({
      welcome: {},
    });
  });
});
