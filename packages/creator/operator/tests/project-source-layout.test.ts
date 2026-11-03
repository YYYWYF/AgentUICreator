import path from "node:path";
import { expect, it } from "vitest";
import { resolveAgentUISourceLayout } from "../src/project/agent-ui-project-paths";
it.each([path.posix, path.win32])("defaults new source roots to flat files with native separators", paths => {
  const root = paths === path.win32 ? "C:\\Agent UI 中文\\src\\agent-ui" : "/Agent UI 中文/src/agent-ui";
  expect(resolveAgentUISourceLayout(root, () => false, paths)).toEqual({
    appUIModelPath: paths.join(root, "app-ui.json"), presentationRoot: root,
  });
});
it.each([path.posix, path.win32])("preserves existing legacy layouts without moving files", paths => {
  const root = paths === path.win32 ? "\\\\server\\share\\Agent UI 中文" : "/Agent UI 中文";
  const files = new Set([paths.join(root, "app-ui", "app-ui.json"), paths.join(root, "agent-ui", "config.ts")]);
  expect(resolveAgentUISourceLayout(root, file => files.has(file), paths)).toEqual({
    appUIModelPath: paths.join(root, "app-ui", "app-ui.json"), presentationRoot: paths.join(root, "agent-ui"),
  });
  files.add(paths.join(root, "app-ui.json"));
  files.add(paths.join(root, "config.ts"));
  expect(resolveAgentUISourceLayout(root, file => files.has(file), paths)).toEqual({
    appUIModelPath: paths.join(root, "app-ui.json"), presentationRoot: root,
  });
});

it.each([path.posix, path.win32])("recognizes a legacy presentation root without theme configuration", paths => {
  const root = paths === path.win32 ? "C:\\Agent UI 中文\\src\\agent-ui" : "/Agent UI 中文/src/agent-ui";
  const files = new Set([paths.join(root, "app-ui", "app-ui.json"), paths.join(root, "agent-ui", "i18n", "locale-config.ts")]);
  expect(resolveAgentUISourceLayout(root, file => files.has(file), paths).presentationRoot).toBe(paths.join(root, "agent-ui"));
});
