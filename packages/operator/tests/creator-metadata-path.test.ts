import path from "node:path";
import { expect, it } from "vitest";
import { isCreatorMetadataPath } from "../src/project/creator-metadata-path";

it("excludes only private Creator state under Agent UI metadata", () => {
  const root = path.resolve("project");

  expect(isCreatorMetadataPath(root, path.join(root, ".agent-ui", "creator", "logs", "run.jsonl"))).toBe(true);
  expect(isCreatorMetadataPath(root, path.join(root, ".agent-ui", "project.json"))).toBe(false);
  expect(isCreatorMetadataPath(root, path.join(root, ".agent-ui", "mocks", "demo.jsonl"))).toBe(false);
});
