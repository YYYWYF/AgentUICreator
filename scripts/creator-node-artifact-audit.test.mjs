import assert from "node:assert/strict";
import test from "node:test";
import { auditCreatorNodeEntry, auditOperatorNodeArtifact } from "./creator-node-artifact-audit.mjs";

const files = entries => new Map(Object.entries(entries).map(([name, text]) => [`package/${name}`, Buffer.from(text)]));
const creator = () => files({
  "dist/cli.js": 'await import("@za38.03/agent-ui-operator/cli");',
  "dist/initialize.js": 'import { configureCreatorDistribution } from "@za38.03/agent-ui-operator/creator-runtime";',
  "dist/index.js": 'export * from "@za38.03/agent-ui-operator";',
});
const manifest = { dependencies: { "@za38.03/agent-ui-operator": "1.2.3" } };

test("Creator audit checks its forwarding entry rather than requiring Operator implementation files", () => {
  assert.deepEqual(auditCreatorNodeEntry(creator(), manifest), { operatorDependency: "1.2.3", nodeEntryForwardsToOperator: true });
});

test("Creator audit rejects an old bundled CLI, copied browser assets and an unpinned Operator", () => {
  const legacy = creator();
  legacy.set("package/dist/cli.js", Buffer.from('import { parseArgs } from "node:util";'));
  assert.throws(() => auditCreatorNodeEntry(legacy, manifest));
  const duplicate = creator();
  duplicate.set("package/dist/browser/index.html", Buffer.from("old UI"));
  assert.throws(() => auditCreatorNodeEntry(duplicate, manifest), /Browser assets belong to Operator/u);
  assert.throws(() => auditCreatorNodeEntry(creator(), { dependencies: { "@za38.03/agent-ui-operator": "^1.2.3" } }), /pin/u);
});

test("Operator audit requires the real control runtime, presets, update UI and API", () => {
  const operator = files({
    "dist/operator/dist/runtime/operator-runtime.mjs": "ensurePluginApplication takeover_plugin_source 工具已确认以下文件存在用户定制",
    "dist/operator/presets/platform/app-ui.json": "{}",
    "dist/operator/presets/assistant/app-ui.json": "{}",
    "dist/operator/presets/embedded/app-ui.json": "{}",
    "dist/ui/CreatorPluginUpdates.js": "export {};",
    "dist/updates/update-api.js": "export {};",
  });
  assert.equal(auditOperatorNodeArtifact(operator).updateUIAndAPIsIncluded, true);
  assert.throws(() => auditOperatorNodeArtifact(creator()), /Missing packaged tooling file/u);
  operator.delete("package/dist/ui/CreatorPluginUpdates.js");
  assert.throws(() => auditOperatorNodeArtifact(operator), /CreatorPluginUpdates/u);
});
