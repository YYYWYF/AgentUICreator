import { describe, expect, it } from "vitest";
import { unstable_defaultDirectiveFormatter } from "@assistant-ui/react";
import { agentUIDirectiveFormatter } from "../src/internal/directive-formatter.js";

// Upstream implementation inspected at pinned revision 3542d602272a62eddeb8989befc910841c267022.
// This intentionally uses the installed upstream formatter so dependency upgrades cannot drift silently.
const references = [
  { type: "user", label: "张三", id: "employee_84721" },
  { type: "resource", label: "项目A", id: "project-a" },
  { type: "file", label: "方案.pdf", id: "file-42" },
  { type: "document", label: "规范", id: "doc-1" },
  { type: "command", label: "总结", id: "summarize" },
  { type: "tool", label: "Search", id: "Search" },
];
describe("pinned assistant-ui directive conformance guard", () => {
  it.each(references)("matches serialization and parsing for $type", reference => {
    const wire = unstable_defaultDirectiveFormatter.serialize(reference);
    expect(agentUIDirectiveFormatter.serialize(reference)).toBe(wire);
    expect(agentUIDirectiveFormatter.parse(wire)).toEqual(unstable_defaultDirectiveFormatter.parse(wire));
  });
  it.each(["", "ordinary text", ":user[", ":user[]", ":user[abc", ":user[x]{name=}",
    references.map(reference => unstable_defaultDirectiveFormatter.serialize(reference)).join(" text "),
  ])("matches upstream segmentation for %s", text => {
    expect(agentUIDirectiveFormatter.parse(text)).toEqual(unstable_defaultDirectiveFormatter.parse(text));
  });
});
