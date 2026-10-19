import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { prepareWorkbench } from "./prepare-workbench.mjs";
import { prepareHostPackages } from "./prepare-host-packages.mjs";
import { hostPackages, preparationState } from "./preparation-state.mjs";

test("Workbench preparation lets both child predev hooks reuse the complete build", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "Agent UI preparation "));
  const entry = path.join(directory, "pnpm.cjs");
  const log = path.join(directory, "calls.jsonl");
  const keys = ["npm_execpath", "AGENT_UI_HOST_PACKAGES_PREPARED", "AGENT_UI_WORKBENCH_PREPARED"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    // Simulate successful builds; this test checks orchestration and must never
    // clean shared dist directories used by other workspace processes.
    writeFileSync(entry, `require("node:fs").appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + "\\n");`);
    process.env.npm_execpath = entry;
    process.env.AGENT_UI_HOST_PACKAGES_PREPARED = preparationState(hostPackages);
    delete process.env.AGENT_UI_WORKBENCH_PREPARED;
    prepareWorkbench();
    const calls = readFileSync(log, "utf8");
    assert.deepEqual(calls.trim().split("\n").map(line => JSON.parse(line)), [
      ["--filter", "@za38.03/agent-ui-creator", "build"],
    ]);
    assert.equal(process.env.AGENT_UI_HOST_PACKAGES_PREPARED, preparationState([...hostPackages, "creator"]));
    prepareHostPackages({ withMock: true });
    prepareWorkbench();
    assert.equal(readFileSync(log, "utf8"), calls, "child predev must not rebuild shared packages");
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
