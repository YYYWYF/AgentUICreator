import assert from "node:assert/strict";

// npm archive entries are logical POSIX paths, including on Windows.
function source(files, logical) {
  const bytes = files.get(`package/${logical}`);
  assert(bytes, `Missing packaged tooling file: ${logical}`);
  return bytes.toString();
}

export function auditCreatorNodeEntry(files, manifest) {
  const operator = "@za38.03/agent-ui-operator";
  assert.match(manifest.dependencies?.[operator] ?? "", /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/u, "Creator must pin its actual Operator dependency");
  assert(source(files, "dist/cli.js").includes(`${operator}/cli`));
  assert(source(files, "dist/initialize.js").includes(`${operator}/creator-runtime`));
  assert(source(files, "dist/index.js").includes(operator));
  assert(![...files.keys()].some(name => name.startsWith("package/dist/browser/")), "Browser assets belong to Operator");
  return { operatorDependency: manifest.dependencies[operator], nodeEntryForwardsToOperator: true };
}

export function auditOperatorNodeArtifact(files) {
  const runtime = source(files, "dist/operator/dist/runtime/operator-runtime.mjs")
    .replace(/\\u([0-9a-f]{4})/giu, (_, code) => String.fromCharCode(parseInt(code, 16)));
  for (const marker of ["ensurePluginApplication", "takeover_plugin_source", "工具已确认以下文件存在用户定制"]) assert(runtime.includes(marker), marker);
  const modes = ["platform", "assistant", "embedded"];
  for (const mode of modes) source(files, `dist/operator/presets/${mode}/app-ui.json`);
  source(files, "dist/ui/CreatorPluginUpdates.js");
  source(files, "dist/updates/update-api.js");
  return { officialPresets: modes, applicationTakeoverAndMergeCodeIncluded: true, updateUIAndAPIsIncluded: true };
}
