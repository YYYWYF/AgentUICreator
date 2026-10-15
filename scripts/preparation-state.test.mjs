import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, unlinkSync } from "node:fs";
import { preparationState } from "./preparation-state.mjs";
test("preparation receipt follows source and output changes; legacy flags cannot skip", () => {
  const before = preparationState(["operator"]);
  assert.notEqual(before, "1");
  const file = new URL("../packages/operator/dist/preparation-test.txt", import.meta.url);
  try {
    writeFileSync(file, "stale");
    const stale = preparationState(["operator"]);
    assert.notEqual(stale, before);
    writeFileSync(file, "rebuilt");
    assert.notEqual(preparationState(["operator"]), stale);
  } finally { unlinkSync(file); }
  assert.equal(preparationState(["operator"]), before);
});
