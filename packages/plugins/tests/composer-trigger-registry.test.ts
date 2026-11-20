// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import {
  CONVERSATION_COMMAND_SOURCE,
  CONVERSATION_MENTION_SOURCE,
  createConversationCommandRegistry,
  type ConversationSlashCommand} from "@za38.03/agent-ui-plugins/composer-triggers";

const command = (id: string): ConversationSlashCommand => ({ id, label: id, mode: "directive" });

describe("packaged composer trigger registry", () => {
  it("keeps the existing service identities and isolates each registry instance", () => {
    expect(CONVERSATION_COMMAND_SOURCE).toBe("conversation.slash-command-source");
    expect(CONVERSATION_MENTION_SOURCE).toBe("conversation.mention-source");
    const first = createConversationCommandRegistry();
    const second = createConversationCommandRegistry();
    first.register(command("custom"));
    expect(first.getSnapshot().map(item => item.id)).toEqual(["custom"]);
    expect(second.getSnapshot()).toEqual([]);
  });

  it("publishes stable immutable snapshots and supports subscription cleanup", () => {
    const registry = createConversationCommandRegistry();
    const initial = registry.getSnapshot();
    const listener = vi.fn();
    const unsubscribe = registry.subscribe(listener);
    const entry = command("custom");
    const remove = registry.register(entry);
    const registered = registry.getSnapshot();
    expect(registered).toEqual([entry]);
    expect(registry.getSnapshot()).toBe(registered);
    expect(initial).toEqual([]);
    expect(Object.isFrozen(registered)).toBe(true);
    expect(listener).toHaveBeenCalledOnce();
    remove();
    expect(registry.getSnapshot()).toEqual([]);
    expect(registered).toEqual([entry]);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    registry.register(command("later"));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("rejects duplicate or empty IDs without disturbing registered commands", () => {
    const registry = createConversationCommandRegistry();
    const entry = command("custom");
    registry.register(entry);
    const snapshot = registry.getSnapshot();
    expect(() => registry.register(command("custom"))).toThrow("Duplicate or invalid conversation command");
    expect(() => registry.register(command(""))).toThrow("Duplicate or invalid conversation command");
    expect(registry.getSnapshot()).toBe(snapshot);
  });

  it("does not let an old cleanup remove a later command with the same ID", () => {
    const registry = createConversationCommandRegistry();
    const remove = registry.register(command("custom"));
    remove();
    const replacement = command("custom");
    registry.register(replacement);
    remove();
    expect(registry.getSnapshot()).toEqual([replacement]);
  });
});

it("bundles the public registry entry without browser UI, Creator or Node runtime dependencies", async () => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL("../dist/composer-triggers.js", import.meta.url))],
    bundle: true, write: false, platform: "browser", format: "esm", metafile: true,
  });
  expect(Object.keys(result.metafile.inputs)).toHaveLength(1);
  expect(result.outputFiles[0]?.text).toContain("createConversationCommandRegistry");
});
