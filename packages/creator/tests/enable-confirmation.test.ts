import { expect, it, vi } from "vitest";
import { confirmPluginEnablement } from "../src/ui/commands/confirmPluginEnablement.js";
import { DEFAULT_CREATOR_MESSAGES } from "../src/ui/i18n/locale.js";
import type { CreatorCommandResult } from "../src/commands/types.js";
const request = { id: "enable" as const, args: { pluginId: "chart-message" } };
const pending = { status: "confirmation-required", changed: false, preparation: { id: "host-preparation", pluginId: "chart-message", files: ["src/ui/plugins/chart-message/index.tsx"], packages: [{ name: "example-library", required: "1.2.3" }] } } as CreatorCommandResult;
it("declining does not send a mutation or continue to the Agent", async () => {
  const execute = vi.fn();
  const confirm = vi.fn((_message: string) => false);
  expect(await confirmPluginEnablement(request, pending, DEFAULT_CREATOR_MESSAGES.commands, () => "Charts", confirm, execute)).toBeUndefined();
  expect(execute).not.toHaveBeenCalled();
  expect(confirm.mock.calls[0]?.[0]).toContain("src/ui/plugins/chart-message/index.tsx");
  expect(confirm.mock.calls[0]?.[0]).toContain("example-library (1.2.3)");
});
it("confirmation sends the exact preparation and original instance target", async () => {
  const done = { status: "agent-required", changed: true } as CreatorCommandResult;
  const execute = vi.fn(async () => done);
  expect(await confirmPluginEnablement({ id: "enable", args: { instanceId: "chart-secondary" } }, pending, DEFAULT_CREATOR_MESSAGES.commands, id => id, () => true, execute)).toBe(done);
  expect(execute).toHaveBeenCalledWith({ id: "enable", args: { instanceId: "chart-secondary", preparationId: "host-preparation" } });
});
it("ready Plugins bypass the confirmation and make no extra requests", async () => {
  const done = { status: "agent-required", changed: false } as CreatorCommandResult;
  const confirm = vi.fn(); const execute = vi.fn();
  expect(await confirmPluginEnablement(request, done, DEFAULT_CREATOR_MESSAGES.commands, id => id, confirm, execute)).toBe(done);
  expect(confirm).not.toHaveBeenCalled(); expect(execute).not.toHaveBeenCalled();
});
