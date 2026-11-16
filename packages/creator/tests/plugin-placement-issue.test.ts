import { expect, it } from "vitest";
import { pluginPlacementIssue } from "../src/commands/plugin-placement-issue.js";

it.each([
  ["AUTHORING_MOVE_INCOMPATIBLE", "slot-cardinality-full"],
  ["AUTHORING_MOVE_INCOMPATIBLE", "slot-capability-mismatch"],
  ["AUTHORING_MOVE_INCOMPATIBLE", "slot-render-scope-mismatch"],
  ["AUTHORING_MOVE_UNSUPPORTED", "slot-not-declared"],
  ["AUTHORING_MOVE_UNSUPPORTED", "slot-accepts-not-declared"],
  ["AUTHORING_DEFAULT_PLACEMENT_UNAVAILABLE", "default-placement-not-declared"],
  ["AUTHORING_DEFAULT_PLACEMENT_UNAVAILABLE", "default-parent-unavailable"],
  ["AUTHORING_DEFAULT_PLACEMENT_AMBIGUOUS", "default-parent-unavailable"],
  ["AUTHORING_DEFAULT_PLACEMENT_AMBIGUOUS", "default-anchor-unavailable"],
])("offers manual placement for %s / %s", (code, reason) => {
  expect(pluginPlacementIssue({ code, details: { reason } })).toEqual({ code, reason });
});

it.each([
  new Error("write failed"),
  { code: "APP_UI_MODEL_HASH_CONFLICT" },
  { code: "CREATOR_COMMAND_BUSY" },
  { code: "PLUGIN_ENABLEMENT_PREPARATION_STALE" },
  { code: "APP_UI_MODEL_WORKSPACE_INTEGRITY" },
  { code: "AUTHORING_MOVE_UNSUPPORTED", details: { reason: "target-capabilities-unavailable" } },
  { code: "AUTHORING_DEFAULT_PLACEMENT_UNAVAILABLE", details: { missingRequiredServices: ["auth.session"] } },
  { code: "AUTHORING_DEFAULT_PLACEMENT_UNAVAILABLE", details: { pluginId: "missing-asset" } },
  { code: "AUTHORING_DEFAULT_PLACEMENT_AMBIGUOUS", details: { pluginId: "duplicate-asset" } },
  { code: "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED", details: { parentRef: "invalid-layout" } },
  null,
  "slot-cardinality-full",
])("does not disguise an operation error as a prepared Plugin: %j", error => {
  expect(pluginPlacementIssue(error)).toBeUndefined();
});
