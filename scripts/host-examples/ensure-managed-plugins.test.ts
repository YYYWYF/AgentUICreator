import assert from "node:assert/strict";
import { test } from "node:test";
import { ensureManagedHostPlugins } from "./ensure-managed-plugins.js";

test("startup preserves legacy package implementations and continues updating other plugins", async () => {
  const applied: string[] = [];
  const updated = await ensureManagedHostPlugins(async request => {
    if (request.operation === "inspect_agent_ui_sources") return { ok: true, result: {
      stateHash: "state",
      items: ["legacy", "other"].filter(id => !applied.includes(`plugin/${id}`) || id === "legacy")
        .map(id => ({ id: `plugin/${id}`, status: "managed", owned: true, updateAvailable: true })),
    } };
    const id = String(request.input.itemId);
    applied.push(id);
    return id === "plugin/legacy"
      ? { ok: false, error: { code: "PLUGIN_ID_RESERVED_BY_OFFICIAL", message: "Explicit migration required" } }
      : { ok: true, result: { changedItems: [id] } };
  }, { preserveCustomized: true });
  assert.deepEqual(updated, ["plugin/other"]);
  assert.deepEqual(applied, ["plugin/legacy", "plugin/other"]);
});

test("unexpected update errors still fail startup", async () => {
  await assert.rejects(ensureManagedHostPlugins(async request => request.operation === "inspect_agent_ui_sources"
    ? { ok: true, result: { stateHash: "state", items: [{ id: "plugin/other", status: "managed", owned: true, updateAvailable: true }] } }
    : { ok: false, error: { code: "IO_ERROR", message: "Cannot write" } },
  { preserveCustomized: true }), /IO_ERROR/);
});
