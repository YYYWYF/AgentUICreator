import { expect, it } from "vitest";
import path from "node:path";
import { projectRelativePath } from "../src/project/agent-ui-project-paths";
import { isCreatorMetadataPath } from "../src/project/creator-metadata-path";

it("normalizes Windows cp callback paths without changing logical separators", () => {
  const root = "C:\\Work Space\\工程";
  expect(projectRelativePath(root, "\\\\?\\C:\\Work Space\\工程\\node_modules", path.win32)).toBe("node_modules");
  expect(projectRelativePath(root, "\\\\?\\C:\\Work Space\\工程\\.agent-ui\\creator\\local.json", path.win32)).toBe(".agent-ui/creator/local.json");
  expect(projectRelativePath("\\\\server\\share\\工程", "\\\\?\\UNC\\server\\share\\工程\\node_modules", path.win32)).toBe("node_modules");
  expect(projectRelativePath("/work space/工程", "/work space/工程/node_modules", path.posix)).toBe("node_modules");
});

it.runIf(process.platform === "win32")("excludes Creator metadata when fs.cp supplies a namespaced path", () => {
  expect(isCreatorMetadataPath("C:\\Work Space\\工程", "\\\\?\\C:\\Work Space\\工程\\.agent-ui\\creator\\local.json")).toBe(true);
  expect(isCreatorMetadataPath("C:\\Work Space\\工程", "\\\\?\\C:\\Work Space\\工程\\src\\local.json")).toBe(false);
});
