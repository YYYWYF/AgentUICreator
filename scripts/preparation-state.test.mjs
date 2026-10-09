import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, unlinkSync } from "node:fs";
import { preparationState } from "./preparation-state.mjs";
test("preparation receipt follows source and output changes; legacy flags cannot skip", () => {
  const before = preparationState(["project-control"]);
  assert.notEqual(before, "1");
  const file = new URL("../packages/project-control/dist/preparation-test.txt", import.meta.url);
  try {
    writeFileSync(file, "stale");
    const stale = preparationState(["project-control"]);
    assert.notEqual(stale, before);
    writeFileSync(file, "rebuilt");
    assert.notEqual(preparationState(["project-control"]), stale);
  } finally { unlinkSync(file); }
  assert.equal(preparationState(["project-control"]), before);
});
