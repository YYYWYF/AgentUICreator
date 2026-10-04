import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { requestSchema, handleUIProjectControlRequest } from "../../src/handler";
import { validateProjectControlResult } from "../../src/result-contract.mjs";
import * as resultContract from "../../src/result-contract.mjs";
import { checkProjectControlContract } from "../../../../scripts/check-project-control-contract.mjs";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const fixtureRoot = path.join(root, "contracts/creator/fixtures/project-control");

describe("ProjectControl canonical wire contract", () => {
  it("keeps operation inventory, bindings, execution and Agent permissions aligned", async () => {
    await checkProjectControlContract();
  });

  it("agrees with canonical JSON Schema for every valid and invalid fixture", async () => {
    const manifest = JSON.parse(await readFile(path.join(fixtureRoot, "manifest.json"), "utf8")) as {
      requests: Array<{ file: string; valid: boolean }>;
      results: Array<{ file: string; operation: string; valid: boolean }>;
    };
    const python = process.env.CREATOR_PYTHON_EXECUTABLE ?? path.join(root, "packages/creator-python/.venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
    expect(existsSync(python), "Install the Creator Python test environment for differential checks").toBe(true);
    const canonical = JSON.parse(execFileSync(python, [path.join(root, "packages/creator-python/tests/project_control_fixture_validation.py")], { encoding: "utf8" })) as Record<string, boolean>;
    for (const entry of manifest.requests) {
      const value: unknown = JSON.parse(await readFile(path.join(fixtureRoot, entry.file), "utf8"));
      expect(requestSchema.safeParse(value).success, entry.file).toBe(entry.valid);
      expect(canonical[entry.file], entry.file).toBe(entry.valid);
    }
    for (const entry of manifest.results) {
      const value: unknown = JSON.parse(await readFile(path.join(fixtureRoot, entry.file), "utf8"));
      let accepted = true;
      try { validateProjectControlResult(entry.operation, value); } catch { accepted = false; }
      expect(accepted, entry.file).toBe(entry.valid);
      expect(canonical[entry.file], entry.file).toBe(entry.valid);
    }
  });

  it("turns a producer contract failure into a bounded Host error", async () => {
    const spy = vi.spyOn(resultContract, "validateProjectControlResult").mockImplementation(() => {
      throw new Error("$.stateHash: missing stateHash");
    });
    try {
      const response = await handleUIProjectControlRequest({
        operation: "inspect_agent_ui_sources", input: {},
      }, path.join(root, "examples/creator-host-sandbox"));
      expect(response).toEqual({
        ok: false,
        error: {
          code: "CONTROL_RESULT_CONTRACT_VIOLATION",
          message: "ProjectControl produced a result that does not match the current contract.",
        },
      });
    } finally { spy.mockRestore(); }
  });

  it("rejects source result drift and a swapped apply/remove result", () => {
    expect(() => validateProjectControlResult("apply_agent_ui_source_item", { changed: true, stateHashRenamed: "a".repeat(64) })).toThrow();
    expect(() => validateProjectControlResult("apply_agent_ui_source_item", {
      operation: "remove", changed: false, changedItems: [],
      sourceChangedPaths: [], generatedChangedPaths: [], changedPaths: [], stateHash: "a".repeat(64),
    })).toThrow();
  });
});
