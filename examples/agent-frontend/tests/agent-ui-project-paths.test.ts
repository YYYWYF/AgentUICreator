import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseAgentUIProjectConfig } from "../framework/contracts/agent-ui-project";
import { resolveAgentUIProjectPaths, validateAgentUISourceRoot } from "../scripts/ui-project/agent-ui-project-paths";
import sourceRootCases from "../../../contracts/fixtures/agent-ui-source-root.json";

const root = path.resolve("/tmp/creator-path-contract");

describe("Agent UI project paths", () => {
  it.each(sourceRootCases.valid)("accepts shared sourceRoot contract %s", (sourceRoot) => {
    expect(validateAgentUISourceRoot(root, sourceRoot)).toBe(path.join(root, sourceRoot));
  });

  it.each(sourceRootCases.invalid)("rejects shared sourceRoot contract %s", (sourceRoot) => {
    expect(() => validateAgentUISourceRoot(root, sourceRoot)).toThrow();
  });
  it.each([
    "src/agent-ui",
    "agent-ui",
    "packages/web/agent-ui",
  ])("resolves V2 sourceRoot %s under Project Root", (sourceRoot) => {
    const config = parseAgentUIProjectConfig({ version: "2", mode: "assistant", sourceRoot });
    const paths = resolveAgentUIProjectPaths(root, config);
    expect(paths.sourceRoot).toBe(path.join(root, sourceRoot));
    expect(paths.appUIModelPath).toBe(path.join(root, sourceRoot, "app-ui/app-ui.json"));
    expect(paths.projectConfigPath).toBe(path.join(root, ".agent-ui/project.json"));
    expect(paths.sourceLockPath).toBe(path.join(root, ".agent-ui/source-lock.json"));
  });

  it.each(["/tmp/other", "../agent-ui", ".", "C:\\outside\\agent-ui", "src/../agent-ui"])(
    "rejects unsafe sourceRoot %s", (sourceRoot) => {
      const config = parseAgentUIProjectConfig({ version: "2", mode: "assistant", sourceRoot });
      expect(() => resolveAgentUIProjectPaths(root, config)).toThrow();
    },
  );

  it("keeps V1 AppUIModel outside its sourceRoot", () => {
    const paths = resolveAgentUIProjectPaths(root, { version: "1", mode: "platform" });
    expect(paths.sourceRoot).toBe(path.join(root, "agent-ui"));
    expect(paths.appUIModelPath).toBe(path.join(root, "app-ui/app-ui.json"));
  });
});
