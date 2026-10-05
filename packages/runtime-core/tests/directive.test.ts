import { describe, expect, it } from "vitest";
import { parseAgentUIDirectives, trySerializeAgentUIDirective } from "../src/directive.js";

describe("Agent UI directive text contract", () => {
  it("serializes stable IDs and omits redundant names", () => {
    expect(trySerializeAgentUIDirective({ type: "user", label: "张三", id: "employee_84721" })).toBe(":user[张三]{name=employee_84721}");
    expect(trySerializeAgentUIDirective({ type: "tool", label: "Search", id: "Search" })).toBe(":tool[Search]");
  });
  it("parses multiple references among ordinary text, including unknown types", () => {
    expect(parseAgentUIDirectives("问 :user[张三]{name=employee_84721} 和 :custom[ABC]。")).toEqual([
      { kind: "text", text: "问 " },
      { kind: "directive", type: "user", label: "张三", id: "employee_84721" },
      { kind: "text", text: " 和 " },
      { kind: "directive", type: "custom", label: "ABC", id: "ABC" },
      { kind: "text", text: "。" },
    ]);
  });
  it.each([":user[", ":user[]", ":user[abc"])("preserves malformed text %s", text => {
    expect(parseAgentUIDirectives(text)).toEqual([{ kind: "text", text }]);
  });
  it.each([
    { type: "bad type", label: "x", id: "x" },
    { type: "user", label: "x]", id: "x" },
    { type: "user", label: "x", id: "bad}" },
    { type: "user", label: "", id: "x" },
    { type: "user", label: "x", id: "" },
    { type: "user", label: "x", id: "x\ny" },
    { type: "user", label: "x".repeat(1025), id: "x" },
  ])("rejects references that cannot safely round-trip: %j", reference => {
    expect(trySerializeAgentUIDirective(reference)).toBeUndefined();
  });
});
