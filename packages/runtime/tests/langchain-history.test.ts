import { describe, expect, it } from "vitest";
import { projectLangChainHistory } from "../src/history/langchain-history-projector.js";

describe("official LangChain converter boundary", () => {
  it("converts structured reasoning and retains backend-specific text verbatim", () => {
    const result = projectLangChainHistory([
      { id: "user", type: "human", content: "Question" },
      { id: "answer", type: "ai", content: "<think>Backend syntax</think>Answer" },
    ]);
    expect(result[1]?.content).toMatchObject([{ type: "text", text: "<think>Backend syntax</think>Answer" }]);
    const structured = projectLangChainHistory([
      { id: "reasoning", type: "ai", content: [{ type: "reasoning", reasoning: "Official reasoning" }, { type: "text", text: "Answer" }] },
    ]);
    expect(structured[0]?.content).toMatchObject([{ type: "reasoning", text: "Official reasoning" }, { type: "text", text: "Answer" }]);
  });
});
