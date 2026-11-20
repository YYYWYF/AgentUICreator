import { expect, it, vi } from "vitest";
import { confirmPluginSourceTakeover } from "../src/ui/commands/confirmPluginSourceTakeover.js";
import { DEFAULT_CREATOR_MESSAGES } from "../src/ui/i18n/locale.js";
import type { CreatorCommandResult } from "../src/commands/types.js";

const request = { id: "takeover" as const, args: { pluginId: "composer" } };
const pending: CreatorCommandResult = {
  status: "confirmation-required", changed: false, receipt: { files: [], validations: [] },
  takeover: { id: "host-plan", plan: {
    pluginId: "composer", package: { name: "@za38.03/agent-ui-plugins", version: "7.8.9" }, pluginVersion: "2.3.4",
    catalogHash: "a".repeat(64), stateHash: "b".repeat(64), planHash: "c".repeat(64),
    applicationChanges: ["index.tsx", "definition.ts"], files: ["plugins/composer/source/index.tsx"],
    instances: ["composer-primary"], sharedDependencies: ["react"], dependencyChanges: ["example-library@1.2.3"],
    compatibility: { pluginSupport: 1 }, recommendations: [], origins: {},
  } },
};
it("shows installed versions and scope before confirmation, and cancellation performs no writes", async () => {
  const confirm = vi.fn((_message: string) => false), execute = vi.fn();
  expect(await confirmPluginSourceTakeover(request, pending, DEFAULT_CREATOR_MESSAGES.commands, id => id, confirm, execute)).toBeUndefined();
  expect(execute).not.toHaveBeenCalled();
  const text = confirm.mock.calls[0]?.[0];
  for (const value of ["7.8.9", "2.3.4", "plugins/composer/source/index.tsx", "definition.ts", "composer-primary", "example-library@1.2.3", "react"]) expect(text).toContain(value);
});
it("applies only the Host-held plan to the originally selected Plugin", async () => {
  const done: CreatorCommandResult = { changed: true, receipt: { files: [], validations: [] } };
  const execute = vi.fn(async () => done);
  expect(await confirmPluginSourceTakeover(request, pending, DEFAULT_CREATOR_MESSAGES.commands, id => id, () => true, execute)).toBe(done);
  expect(execute).toHaveBeenCalledExactlyOnceWith({ id: "takeover", args: { pluginId: "composer", preparationId: "host-plan" } });
  await expect(confirmPluginSourceTakeover({ id: "takeover", args: { pluginId: "reasoning" } }, pending, DEFAULT_CREATOR_MESSAGES.commands, id => id, () => true, execute)).rejects.toThrow("PLUGIN_SOURCE_PLAN_STALE");
  expect(execute).toHaveBeenCalledTimes(1);
});
