import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("@agent-ui/runtime-conversation public API", () => {
  it("exports the package root only through public.js", async () => {
    const packageJson = JSON.parse(
      await readFile(path.join(packageRoot, "package.json"), "utf8"),
    ) as { exports?: Record<string, unknown> };
    const indexSource = await readFile(path.join(packageRoot, "src/index.ts"), "utf8");

    expect(indexSource.trim()).toBe('export * from "./public.js";');
    expect(Object.keys(packageJson.exports ?? {})).toEqual(["."]);
  });

  it("keeps the public source generic", async () => {
    const source = await readFile(path.join(packageRoot, "src/public.tsx"), "utf8");

    for (const publicName of [
      "ConversationRuntimeProvider",
      "ConversationRuntimeBridge",
      "useConversationRuntimeBridge",
      "createEphemeralConversationThreadBinding",
    ]) {
      expect(source, publicName).toMatch(new RegExp(`export (?:function|interface|type) ${publicName}\\b`, "u"));
    }
    expect(source).toContain("ConversationStarterSuggestion");
    expect(source).toContain('from "./errors.js"');
    expect(source).not.toContain('from "./compatibility/conversation-runtime-bridge.js"');
    for (const forbiddenName of ["AssistantUi", "ThreadPrimitive", "useAui", "AuiConfig"]) {
      expect(source, forbiddenName).not.toContain(forbiddenName);
    }
  });
});
