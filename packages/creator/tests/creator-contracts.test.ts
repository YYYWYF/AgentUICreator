import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { RunAgentInputSchema } from "@ag-ui/core";
import Ajv2020, { type AnySchema, type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { beforeAll, describe, expect, it } from "vitest";

import {
  CREATOR_PROJECT_CONTROL_SCHEMA_VERSION,
  parseProjectControlResponse,
} from "../src/index.js";
import {
  parseCreatorRuntimeComposition,
  parseCreatorRuntimeDiagnostic,
} from "../src/runtime-diagnostics/CreatorRuntimeDiagnosticStore.js";

const contractsRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../contracts/creator",
);

const schemaNames = [
  "creator-transport.schema.json",
  "project-control.schema.json",
  "app-ui-model-operation.schema.json",
  "creator-receipt.schema.json",
  "creator-host-results.schema.json",
] as const;

async function json(name: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path.join(contractsRoot, name), "utf8")) as Record<
    string,
    unknown
  >;
}

async function fixture(name: string): Promise<Record<string, unknown>> {
  return json(path.join("fixtures", name));
}

const validators = new Map<string, ValidateFunction>();

function expectSchema(name: (typeof schemaNames)[number], value: unknown): void {
  const validate = validators.get(name);
  expect(validate, `Missing validator for ${name}`).toBeDefined();
  expect(validate!(value), JSON.stringify(validate!.errors, null, 2)).toBe(true);
}

beforeAll(async () => {
  const schemas = await Promise.all(
    schemaNames.map(async (name) => [name, await json(name)] as const),
  );
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  schemas.forEach(([, schema]) => ajv.addSchema(schema as AnySchema));
  schemas.forEach(([name, schema]) => {
    validators.set(name, ajv.getSchema(String(schema.$id))!);
  });
});

describe("Creator frozen cross-language contracts", () => {
  it("validates the Phase 1 transport fixture with JSON Schema and TS runtime parsers", async () => {
    const golden = await fixture("ag-ui-echo.json");

    expectSchema("creator-transport.schema.json", golden.handshake);
    expectSchema("creator-transport.schema.json", golden.health);
    expectSchema("creator-transport.schema.json", golden.request);
    for (const event of golden.events as unknown[]) {
      expectSchema("creator-transport.schema.json", event);
    }

    const request = RunAgentInputSchema.parse(golden.request);
    expect(request).toMatchObject({
      threadId: "creator-thread",
      runId: "creator-run",
      messages: [{ content: "hello-python-sidecar-测试" }],
    });
    expect((golden.events as Array<{ type: string }>).map((event) => event.type)).toEqual(
      golden.eventTypes,
    );
  });

  it("validates runtime diagnostics through the shared schema and TS parsers", async () => {
    const golden = await fixture("runtime-diagnostics.json");
    const diagnosticEnvelope = golden.diagnosticEnvelope as Record<string, unknown>;
    const compositionEnvelope = golden.compositionEnvelope as Record<string, unknown>;

    expectSchema("creator-transport.schema.json", diagnosticEnvelope);
    expectSchema("creator-transport.schema.json", compositionEnvelope);
    expect(parseCreatorRuntimeDiagnostic(diagnosticEnvelope.diagnostic)).toMatchObject({
      schemaVersion: 1,
      status: "error",
      instanceId: "messages-main",
    });
    expect(parseCreatorRuntimeComposition(compositionEnvelope.composition)).toMatchObject({
      schemaVersion: 1,
      instances: [{ instanceId: "messages-main" }],
    });
  });

  it("validates Project Control requests, operations, and responses", async () => {
    const golden = await fixture("project-control.json");
    const request = golden.request as Record<string, unknown>;
    const input = request.input as Record<string, unknown>;

    expectSchema("project-control.schema.json", request);
    expectSchema("project-control.schema.json", golden.success);
    expectSchema("project-control.schema.json", golden.failure);
    for (const operation of input.operations as unknown[]) {
      expectSchema("app-ui-model-operation.schema.json", operation);
    }

    expect(request).toMatchObject({
      schemaVersion: CREATOR_PROJECT_CONTROL_SCHEMA_VERSION,
      operation: "mutate_app_ui_model",
    });
    expect(parseProjectControlResponse(golden.success)).toMatchObject({
      schemaVersion: CREATOR_PROJECT_CONTROL_SCHEMA_VERSION,
      ok: true,
    });
    expect(parseProjectControlResponse(golden.failure)).toMatchObject({
      schemaVersion: CREATOR_PROJECT_CONTROL_SCHEMA_VERSION,
      ok: false,
      error: { code: "APP_UI_MODEL_STALE" },
    });
  });

  it("validates host validation, Fast Path, and receipt fixtures", async () => {
    const golden = await fixture("creator-host-results.json");

    expectSchema("creator-host-results.schema.json", golden.validation);
    expectSchema("creator-host-results.schema.json", golden.fastPath);
    expectSchema("creator-receipt.schema.json", golden.receipt);
    expect(golden.validation).toMatchObject({ revision: 2, status: "passed" });
    expect(golden.fastPath).toMatchObject({
      handled: true,
      metrics: { generalAgentCalls: 0 },
    });
    expect(golden.receipt).toMatchObject({
      files: [{ path: "app-ui/app-ui.json", status: "modified" }],
      validations: [],
    });
  });

  it("fails when a fixture schema version drifts", async () => {
    const golden = await fixture("project-control.json");
    const drifted = {
      ...(golden.request as Record<string, unknown>),
      schemaVersion: 999,
    };
    const validate = validators.get("project-control.schema.json")!;

    expect(validate(drifted)).toBe(false);
  });
});
