import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  AssistantUiSuggestionsPlugin,
  readSuggestionItems,
} from "../plugins/assistant-ui-suggestions";
import { assistantUiSuggestionsPlugin } from "../plugins/assistant-ui-suggestions/definition";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("assistant-ui-suggestions boundary", () => {
  it("uses the assistant-ui-native plugin identity and prompt vocabulary", () => {
    expect(assistantUiSuggestionsPlugin.manifest).toMatchObject({
      id: "assistant-ui-suggestions",
      version: "1.0.0",
      capabilities: ["conversation-suggestions"],
    });
    expect(readSuggestionItems([
      {
        title: "分析架构",
        label: "检查边界",
        prompt: "帮我分析当前 Agent UI 架构",
      },
      { label: "缺少 prompt" },
      "不属于新合同",
    ])).toEqual([{
      title: "分析架构",
      label: "检查边界",
      prompt: "帮我分析当前 Agent UI 架构",
    }]);
  });

  it("renders through ThreadPrimitive.Suggestion without a custom send action", async () => {
    const source = await readFile(
      path.join(projectRoot, "plugins/assistant-ui-suggestions/index.tsx"),
      "utf8",
    );
    expect(source).toContain('from "@assistant-ui/react"');
    expect(source).toContain("ThreadPrimitive.Suggestion");
    expect(source).toContain("prompt={item.prompt}");
    expect(source).toContain("send");
    expect(source).not.toMatch(/agent-ui\/components|sendMessage|usePluginActions|antd/u);
    expect(source).toContain('data-ui-plugin="assistant-ui-suggestions"');
    expect(AssistantUiSuggestionsPlugin).toBeTypeOf("function");
  });
});
