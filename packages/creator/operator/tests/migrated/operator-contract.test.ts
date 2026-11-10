import { generatedProjectFixture } from "../support/generated-project";
import { readFile, readdir } from "node:fs/promises";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { requestSchema, handleUIOperatorRequest } from "../../src/handler";
import { validateOperatorResult } from "../../src/result-contract.mjs";
import * as resultContract from "../../src/result-contract.mjs";
import { checkOperatorContract } from "../../../../../scripts/check-operator-contract.mjs";
import { inspectUIProject, inspectUIComposition } from "../../src/project/project-inspector";

const root = fileURLToPath(new URL("../../../../../", import.meta.url));
const fixtureRoot = path.join(root, "packages/creator/contracts/creator/fixtures/operator");

describe("Operator canonical wire contract", () => {
  it.each([
    { name: "full", input: {}, inspect: inspectUIProject },
    { name: "composition", input: { view: "composition" }, inspect: inspectUIComposition },
  ])("accepts actual $name project inspection results through the wire boundary", async ({ input, inspect }) => {
    const projectRoot = await generatedProjectFixture();
    const schema = JSON.parse(await readFile(path.join(root, "packages/creator/contracts/creator/operator.schema.json"), "utf8"));
    const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
    ajv.addSchema(schema);
    ajv.addSchema(JSON.parse(await readFile(path.join(root, "packages/creator/contracts/creator/app-ui-model-operation.schema.json"), "utf8")));
    const validate = ajv.compile({ $ref: `${schema.$id}#/$defs/inspectUIProjectResult` });
    const result = await inspect(projectRoot);
    expect(result.appUIModel.runtimeHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(validate(JSON.parse(JSON.stringify(result))), JSON.stringify(validate.errors)).toBe(true);
    expect(() => validateOperatorResult("inspect_ui_project", result)).not.toThrow();
    expect(await handleUIOperatorRequest({ operation: "inspect_ui_project", input }, projectRoot))
      .toEqual({ ok: true, result });
    const invalid = { ...result, appUIModel: { ...result.appUIModel, runtimeHash: "invalid" } };
    expect(validate(JSON.parse(JSON.stringify(invalid)))).toBe(false);
    expect(() => validateOperatorResult("inspect_ui_project", invalid)).toThrow();
  });
  it("keeps operation inventory, bindings, execution and Agent permissions aligned", async () => {
    await checkOperatorContract();
  });

  it("agrees with canonical JSON Schema for every valid and invalid fixture", async () => {
    const manifest = JSON.parse(await readFile(path.join(fixtureRoot, "manifest.json"), "utf8")) as {
      requests: Array<{ file: string; valid: boolean }>;
      results: Array<{ file: string; operation: string; valid: boolean }>;
    };
    const schema = JSON.parse(await readFile(path.join(root, "packages/creator/contracts/creator/operator.schema.json"), "utf8"));
    const inventory = JSON.parse(await readFile(path.join(root, "packages/creator/contracts/creator/operator.operations.json"), "utf8"));
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    (addFormats as unknown as (instance: typeof ajv) => void)(ajv);
    const contractRoot = path.join(root, "packages/creator/contracts/creator");
    for (const name of await readdir(contractRoot)) {
      if (name.endsWith(".schema.json")) ajv.addSchema(JSON.parse(await readFile(path.join(contractRoot, name), "utf8")));
    }
    const canonicalRequest = ajv.compile({ $ref: `${schema.$id}#/$defs/request` });
    for (const entry of manifest.requests) {
      const value: unknown = JSON.parse(await readFile(path.join(fixtureRoot, entry.file), "utf8"));
      expect(requestSchema.safeParse(value).success, entry.file).toBe(entry.valid);
      expect(canonicalRequest(value), entry.file).toBe(entry.valid);
    }
    for (const entry of manifest.results) {
      const value: unknown = JSON.parse(await readFile(path.join(fixtureRoot, entry.file), "utf8"));
      let accepted = true;
      try { validateOperatorResult(entry.operation, value); } catch { accepted = false; }
      expect(accepted, entry.file).toBe(entry.valid);
      const operation = inventory.operations.find((item: { name: string }) => item.name === entry.operation);
      expect(operation, entry.operation).toBeDefined();
      const canonicalResult = ajv.compile({ $ref: `${schema.$id}#/$defs/${operation.resultDef}` });
      expect(canonicalResult(value), entry.file).toBe(entry.valid);
    }
  });

  it("turns a producer contract failure into a bounded Host error", async () => {
    const spy = vi.spyOn(resultContract, "validateOperatorResult").mockImplementation(() => {
      throw new Error("$.stateHash: missing stateHash");
    });
    try {
      const response = await handleUIOperatorRequest({
        operation: "inspect_agent_ui_sources", input: {},
      }, await generatedProjectFixture());
      expect(response).toEqual({
        ok: false,
        error: {
          code: "OPERATOR_RESULT_CONTRACT_VIOLATION",
          message: "Operator produced a result that does not match the current contract.",
        },
      });
    } finally { spy.mockRestore(); }
  });

  it("rejects source result drift and a swapped apply/remove result", () => {
    expect(() => validateOperatorResult("apply_agent_ui_source_item", { changed: true, stateHashRenamed: "a".repeat(64) })).toThrow();
    expect(() => validateOperatorResult("apply_agent_ui_source_item", {
      operation: "remove", changed: false, changedItems: [],
      sourceChangedPaths: [], generatedChangedPaths: [], changedPaths: [], stateHash: "a".repeat(64),
    })).toThrow();
  });
});
