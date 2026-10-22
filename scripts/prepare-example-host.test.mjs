import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { ensureExampleHost } from "./prepare-example-host.mjs";

const ready = mode => ({ status: "ready", projectConfig: { mode, sourceRoot: "src/agent-ui" } });
for (const mode of ["platform", "assistant", "embedded"]) {
  test(`${mode} initializes an absent project using its own preset and verifies the result`, async () => {
    const calls = [];
    let state = { status: "uninitialized" };
    const result = await ensureExampleHost(mode, {
      root: path.resolve("workspace with spaces"),
      inspectProject: async () => state,
      initializeProject: async input => { calls.push(input); state = ready(mode); },
    });
    assert.deepEqual(calls, [{ projectRoot: result.projectRoot, mode, sourceRoot: "src/agent-ui" }]);
  });
  test(`${mode} does not reinitialize a ready project or adopt a new source baseline`, async () => {
    await ensureExampleHost(mode, {
      inspectProject: async () => ready(mode),
      initializeProject: async () => assert.fail("must preserve existing application/source files"),
    });
  });
}
test("broken or mismatched examples stop without resetting or migrating files", async () => {
  for (const state of [{ status: "broken", issues: [{ code: "custom-source-conflict" }] }, ready("assistant")]) {
    await assert.rejects(ensureExampleHost("platform", {
      inspectProject: async () => state,
      initializeProject: async () => assert.fail("must not overwrite an existing project"),
    }), /requires repair/);
  }
});
test("an initialization that does not produce the selected ready project is rejected", async () => {
  await assert.rejects(ensureExampleHost("embedded", {
    inspectProject: async () => ({ status: "uninitialized" }), initializeProject: async () => {},
  }), /requires repair/);
});
test("unknown modes fail before inspection or mutation", async () => {
  await assert.rejects(ensureExampleHost("../../outside", {
    inspectProject: async () => assert.fail("must not inspect"), initializeProject: async () => assert.fail("must not initialize"),
  }), /Unknown example Mode/);
});
