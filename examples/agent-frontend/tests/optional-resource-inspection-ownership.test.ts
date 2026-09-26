import { expect, it } from "vitest";
import { isOptionalAgentUISourceItem } from "@agent-ui/source-registry";
import { mergeOptionalResourceInspection } from "../scripts/ui-project/optional-resource-paths";
import type { AgentUISourceInspection, AgentUISourceItemInspection } from "../scripts/ui-project/types";

function item(id: string, status: AgentUISourceItemInspection["status"], installedVersion?: string): AgentUISourceItemInspection {
  return {
    id, status, availableVersion: "1.0.0",
    ...(installedVersion === undefined ? {} : { installedVersion }),
    files: [], requirements: [], dependencies: [], resolvedRequirements: [], dependencyIssues: [], issues: [],
  };
}
function inspection(items: AgentUISourceItemInspection[]): AgentUISourceInspection {
  return { stateHash: "inspection", sourceRoot: ".", metadataRoot: ".agent-ui/scenario-resources", items, packages: [], issues: [] };
}

it.each(["managed", "customized", "partial"] as const)("uses resource ownership for any dependency kind even when status is %s", async status => {
  const normalDependency = item("dependency/X", "blocked");
  const resourceDependency = item("dependency/X", status, "1.0.0");
  const normalOnly = item("normal/Y", "customized", "2.0.0");
  const unownedResource = item("normal/Y", "managed");
  const resourceOnly = item("dependency/Z", "managed", "1.0.0");
  const unownedOnly = item("unowned/W", "blocked");
  const normal = { ...inspection([normalDependency, normalOnly]), stateHash: "normal", sourceRoot: "agent-ui", metadataRoot: ".agent-ui" };
  const merged = await mergeOptionalResourceInspection(normal, inspection([resourceDependency, unownedResource, resourceOnly, unownedOnly]));
  expect(merged.items).toEqual([normalOnly, resourceDependency, resourceOnly]);
  expect(merged.items.find(entry => entry.id === "dependency/X")).toBe(resourceDependency);
  expect(merged.items.find(entry => entry.id === "normal/Y")).toBe(normalOnly);
  expect(merged.stateHash).toBe(normal.stateHash);
  expect(merged.sourceRoot).toBe(normal.sourceRoot);
  expect(merged.metadataRoot).toBe(normal.metadataRoot);
});

it("keeps dependency kinds out of the optional installation root allowlist", () => {
  expect(isOptionalAgentUISourceItem({ kind: "demo" })).toBe(true);
  expect(isOptionalAgentUISourceItem({ kind: "integration" })).toBe(true);
  for (const kind of ["primitive", "agent-component", "foundation"] as const) {
    expect(isOptionalAgentUISourceItem({ kind })).toBe(false);
  }
});
