import { describe, expect, it } from "vitest";

import {
  resolveAssistantUiPresentationConfig,
} from "../agent-ui/adapters/assistant-ui/config";
import type { AppUIModel } from "../framework/contracts/app-ui-model";

function createModel(
  assistantUiPresentation?: Record<string, unknown>,
): AppUIModel {
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
        ...(assistantUiPresentation === undefined
          ? {}
          : { props: { assistantUiPresentation } }),
      },
    },
  };
}

describe("assistant-ui presentation config", () => {
  it("maps Welcome, runtime suggestions, and interaction variants", () => {
    expect(resolveAssistantUiPresentationConfig(createModel({
      welcome: {
        title: "Agent Frontend",
        description: "Canonical assistant-ui presentation",
      },
      starterSuggestions: [
        {
          key: "summary",
          label: "总结当前上下文",
          description: "提炼目标、约束与下一步",
        },
        {
          label: "显式提示",
          description: "发送不同的内容",
          prompt: "请详细说明",
        },
        "字符串建议",
        { label: "   " },
        null,
        42,
      ],
      interactions: {
        reasoningVariant: "outline",
        toolGroupVariant: "muted",
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
      starterSuggestions: [
        {
          title: "总结当前上下文",
          label: "提炼目标、约束与下一步",
          prompt: "总结当前上下文",
        },
        {
          title: "显式提示",
          label: "发送不同的内容",
          prompt: "请详细说明",
        },
        {
          title: "字符串建议",
          prompt: "字符串建议",
        },
      ],
      interactions: {
        reasoningVariant: "outline",
        toolGroupVariant: "muted",
      },
    });
  });

  it("does not expose the removed composer presentation contract", () => {
    const presentation = resolveAssistantUiPresentationConfig(createModel({
      composer: {
        placeholder: "No longer supported by Thread",
        quickPrompts: [{ label: "No", value: "No" }],
      },
    }));

    expect(presentation).toEqual({
      welcome: {},
      starterSuggestions: [],
      interactions: {},
    });
    expect(presentation).not.toHaveProperty("composer");
  });

  it("fails closed to empty product configuration when the surface is absent", () => {
    expect(resolveAssistantUiPresentationConfig(createModel())).toEqual({
      welcome: {},
      starterSuggestions: [],
      interactions: {},
    });
  });
});
