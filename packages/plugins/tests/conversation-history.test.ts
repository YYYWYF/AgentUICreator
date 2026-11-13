import { describe, expect, it } from "vitest";
import { projectConversationDetail } from "../src/plugins/conversation-service/adapters/presentation/conversation-history-projector";
const projectLangChainHistory = (messages: readonly unknown[]) => projectConversationDetail({
  id: "history", title: "History", history: { format: "langchain", messages },
});

describe("persisted LangChain think envelopes", () => {
  it.each(["\n", "\r\n"])("separates reasoning from the answer and ignores trailing empty think records (%j)", newline => {
    const input = [
      { id: "user", type: "human", content: "Question" },
      { id: "answer", type: "ai", name: null, content: `<think>${newline}Review the request.${newline}</think>${newline}${newline}Answer`, tool_calls: [], additional_kwargs: {} },
      ...Array.from({ length: 44 }, (_, index) => ({ id: `empty-${index}`, type: "ai", content: "<think>" })),
    ];
    const original = structuredClone(input);
    const result = projectLangChainHistory(input);
    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({ id: "answer", role: "assistant", content: [
      { type: "reasoning", text: "Review the request." }, { type: "text", text: "Answer" },
    ] });
    expect(input).toEqual(original);
  });

  it.each(["<think>", " \r\n<think>\r\n", "<think> </think>\n"])("does not render an empty assistant envelope: %j", content => {
    expect(projectLangChainHistory([{ id: "empty", type: "ai", content }])).toEqual([]);
  });

  it("retains unclosed nonempty reasoning as completed historical content", () => {
    expect(projectLangChainHistory([{ id: "partial", type: "ai", content: "<think>Saved partial reasoning" }])[0]).toMatchObject({
      role: "assistant", content: [{ type: "reasoning", text: "Saved partial reasoning" }], status: { type: "complete" },
    });
  });

  it("preserves tool identity, args, results and custom metadata alongside reasoning", () => {
    const result = projectLangChainHistory([
      { id: "call", type: "ai", content: "<think>Choose a type</think>", additional_kwargs: { metadata: { business: "kept" } },
        tool_calls: [{ id: "call-1", name: "vacation_choice", args: { vacation: ["short"] }, type: "tool_call" }] },
      { id: "result", type: "tool", tool_call_id: "call-1", name: "vacation_choice", content: "Waiting for client", status: "success" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ role: "assistant", metadata: { custom: { business: "kept" } }, content: [
      { type: "reasoning", text: "Choose a type" },
      { type: "tool-call", toolCallId: "call-1", toolName: "vacation_choice", args: { vacation: ["short"] }, result: "Waiting for client" },
    ] });
  });

  it("retains a tool call even when its text contains only an empty think envelope", () => {
    const result = projectLangChainHistory([
      { id: "call", type: "ai", content: "<think>", tool_calls: [{ id: "call-1", name: "lookup", args: {} }] },
      { type: "tool", tool_call_id: "call-1", content: "Saved result" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.content).toMatchObject([{ type: "tool-call", toolCallId: "call-1", result: "Saved result" }]);
  });

  it("keeps literal tags and structured/multimodal messages unchanged", () => {
    const input = [
      { id: "user", type: "human", content: "<think>User input</think>" },
      { id: "answer", type: "ai", content: "Example: `<think>literal</think>`" },
      { id: "image", type: "human", content: [{ type: "image_url", image_url: { url: "https://example.test/image.png" } }] },
      { id: "structured", type: "ai", content: [{ type: "reasoning", reasoning: "Native reasoning" }, { type: "text", text: "<think>literal</think>" }] },
    ];
    const result = projectLangChainHistory(input);
    expect(result[0]?.content).toMatchObject([{ type: "text", text: input[0]!.content }]);
    expect(result[1]?.content).toMatchObject([{ type: "text", text: input[1]!.content }]);
    expect(result[2]?.content).toContainEqual(expect.objectContaining({ type: "image", image: "https://example.test/image.png" }));
    expect(result[3]?.content).toMatchObject([{ type: "reasoning", text: "Native reasoning" }, { type: "text", text: "<think>literal</think>" }]);
  });

});
