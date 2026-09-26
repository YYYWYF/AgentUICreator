import { describe, expect, it } from "vitest";
import { projectConversationTurns, resolveConversationTurnGroup } from "../src/internal/conversation-turn.js";

const messages = (roles: string[]) => roles.map((role, index) => ({ id: String(index), role }));
const owners = (roles: string[]) => [...projectConversationTurns(messages(roles)).values()]
  .map((turn) => turn.tailAssistantMessageId);

describe("Conversation Turn grouping on the visible branch", () => {
  it.each<[string[], string[]]>([
    [["user", "assistant"], ["1"]],
    [["user", "assistant", "assistant", "assistant"], ["3"]],
    [["user", "assistant", "assistant", "user", "assistant", "assistant"], ["2", "5"]],
    [["user", "assistant", "system", "assistant"], ["3"]],
    [["assistant", "assistant"], ["1"]],
    [["system", "assistant", "tool", "assistant"], ["3"]],
    [["user", "assistant", "tool", "assistant"], ["3"]],
    [["user", "assistant", "system"], ["1"]],
    [["user", "system", "user", "assistant"], ["3"]],
  ])("reconstructs %j deterministically", (roles, expected) => {
    expect(owners(roles)).toEqual(expected);
    const snapshot = messages(roles);
    expect([...projectConversationTurns(JSON.parse(JSON.stringify(snapshot)))])
      .toEqual([...projectConversationTurns(snapshot)]);
  });

  it("shares one group for ownership and actions across system/tool records", () => {
    const visible = messages(["user", "assistant", "system", "tool", "assistant", "assistant"]);
    const expected = {
      turnId: "history:user:0", requestMessageId: "0", assistantMessageIds: ["1", "4", "5"],
      headAssistantMessageId: "1", tailAssistantMessageId: "5",
      headAssistantIndex: 1, tailAssistantIndex: 5,
    };
    expect([...projectConversationTurns(visible).values()]).toEqual([expected]);
    for (const id of expected.assistantMessageIds) {
      expect(resolveConversationTurnGroup(visible, id)).toEqual(expected);
    }
    for (const id of ["0", "2", "3", "missing"]) {
      expect(resolveConversationTurnGroup(visible, id)).toBeNull();
    }
  });

  it("keeps continuation messages in the same turn as restored history", () => {
    const first = messages(["user", "assistant"]);
    const continued = [...first, ...messages(["system", "assistant", "assistant"])
      .map((message, index) => ({ ...message, id: String(index + 2) }))];
    expect(resolveConversationTurnGroup(first, "1")?.turnId)
      .toBe(resolveConversationTurnGroup(continued, "4")?.turnId);
    expect([...projectConversationTurns(continued).values()]).toHaveLength(1);
    expect(resolveConversationTurnGroup(continued, "1")?.assistantMessageIds).toEqual(["1", "3", "4"]);
    expect(resolveConversationTurnGroup(JSON.parse(JSON.stringify(continued)), "4"))
      .toEqual(resolveConversationTurnGroup(continued, "4"));
  });

  it("never merges two user requests and collects only each turn's assistants", () => {
    const turns = [...projectConversationTurns(messages([
      "user", "assistant", "system", "assistant", "user", "assistant", "assistant",
    ])).values()];
    expect(turns).toHaveLength(2);
    expect(turns.map((turn) => turn.assistantMessageIds)).toEqual([["1", "3"], ["5", "6"]]);
    expect(turns.map((turn) => turn.tailAssistantMessageId)).toEqual(["3", "6"]);
    expect(turns.map((turn) => turn.requestMessageId)).toEqual(["0", "4"]);
  });

  it("ignores hidden branch tails and recomputes the selected branch", () => {
    const u = { id: "u", role: "user" };
    const a = { id: "a", role: "assistant" };
    const b = { id: "b", role: "assistant" };
    expect(resolveConversationTurnGroup([u, a], "a")?.tailAssistantMessageId).toBe("a");
    expect(resolveConversationTurnGroup([u, a, b], "a")?.tailAssistantMessageId).toBe("b");
    expect(resolveConversationTurnGroup([u, a], "b")).toBeNull();
  });
});
