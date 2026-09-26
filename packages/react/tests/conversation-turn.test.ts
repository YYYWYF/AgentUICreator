import { describe, expect, it } from "vitest";
import { projectConversationTurnOwnership, projectConversationTurns } from "../src/internal/conversation-turn.js";
const messages = (roles: string[]) => roles.map((role, index) => ({ id: String(index), role }));
const owners = (roles: string[], liveIds?: Record<string, string>) => [...projectConversationTurnOwnership(messages(roles), liveIds)].filter(([, metadata]) => metadata.isFooterOwner).map(([id]) => id);

describe("turn Footer ownership on the visible branch", () => {
  it.each<[string[], string[]]>([
    [["user", "assistant"], ["1"]],
    [["user", "assistant", "assistant", "assistant"], ["3"]],
    [["user", "assistant", "assistant", "user", "assistant", "assistant"], ["2", "5"]],
    [["user", "assistant", "system", "assistant"], ["3"]],
    [["assistant", "assistant"], ["1"]],
    [["user", "assistant", "tool", "assistant"], ["3"]],
  ])("reconstructs %j deterministically", (roles, expected) => {
    expect(owners(roles)).toEqual(expected);
    expect(owners(roles)).toEqual(expected);
    const snapshot = messages(roles);
    expect([...projectConversationTurnOwnership(JSON.parse(JSON.stringify(snapshot)))]).toEqual([...projectConversationTurnOwnership(snapshot)]);
  });
  it("moves live Footer ownership as a second assistant message arrives", () => {
    const attribution = { "1": "run-a", "2": "run-a" };
    expect(owners(["user", "assistant"], attribution)).toEqual(["1"]);
    expect(owners(["user", "assistant", "assistant"], attribution)).toEqual(["2"]);
    expect(projectConversationTurnOwnership(messages(["user", "assistant", "assistant"]), attribution).get("2")?.turnId).toBe("run-a");
  });
  it("uses separate root run identities without depending on random history IDs", () => {
    expect(owners(["user", "assistant", "assistant"], { "1": "run-a", "2": "run-b" })).toEqual(["1", "2"]);
  });
  it("ignores hidden branch tails and recomputes the selected branch", () => {
    const ids = { a: "run-a", b: "run-a", hidden: "run-a" };
    const u = { id: "u", role: "user" };
    const a = { id: "a", role: "assistant" };
    const b = { id: "b", role: "assistant" };
    expect(projectConversationTurnOwnership([u, a], ids).get("a")?.isFooterOwner).toBe(true);
    expect(projectConversationTurnOwnership([u, a, b], ids).get("a")?.isFooterOwner).toBe(false);
    expect(projectConversationTurnOwnership([u, a, b], ids).get("b")?.isFooterOwner).toBe(true);
  });
});

describe("turn action projection", () => {
  it("shares head, tail and scope across intervening system/tool messages", () => {
    const turns = [...projectConversationTurns(messages(["user", "assistant", "system", "tool", "assistant"])).values()];
    expect(turns).toEqual([{
      turnId: "history:user:0", requestMessageId: "0", assistantMessageIds: ["1", "4"],
      headAssistantMessageId: "1", tailAssistantMessageId: "4", footerOwnerMessageId: "4",
    }]);
  });
  it("uses the same projection for a root run and attributed HITL continuation", () => {
    const visible = messages(["user", "assistant", "system", "assistant"]);
    const live = [...projectConversationTurns(visible, { "1": "root", "3": "root" }).values()];
    const history = [...projectConversationTurns(JSON.parse(JSON.stringify(visible))).values()];
    expect(live).toHaveLength(1);
    expect(live[0]?.assistantMessageIds).toEqual(history[0]?.assistantMessageIds);
    expect(live[0]?.headAssistantMessageId).toBe(history[0]?.headAssistantMessageId);
    expect(live[0]?.footerOwnerMessageId).toBe(history[0]?.footerOwnerMessageId);
  });
});
