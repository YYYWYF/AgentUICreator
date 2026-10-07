import { expect, it } from "vitest";
import { parseCreatorCommand } from "../src/commands/parser.js";
it.each(["Make the composer narrower", "把主题改成紫色", "text /theme violet"])("keeps natural language on the Agent path: %s", input => {
  expect(parseCreatorCommand(input)).toEqual({ kind: "text" });
});
it.each(["/", "/theme", "/theme violet", "/theme invalid", "/unknown", " /unknown\n arg", "/theme violet extra"])("always intercepts slash input: %s", input => {
  expect(parseCreatorCommand(input).kind).toBe("command");
});
it("preserves unknown IDs and all arguments for authoritative validation", () => {
  expect(parseCreatorCommand(" /unknown a b ")).toEqual({ kind: "command", id: "unknown", args: ["a", "b"] });
});
