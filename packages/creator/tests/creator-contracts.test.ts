import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { RunAgentInputSchema } from "@ag-ui/core";
import { describe, expect, it } from "vitest";

import {
  CREATOR_PROJECT_CONTROL_SCHEMA_VERSION,
  parseProjectControlResponse,
} from "../src/index.js";

const contractsRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../contracts/creator",
);

async function fixture(name: string): Promise<Record<string, unknown>> {
  return JSON.parse(
    await readFile(path.join(contractsRoot, "fixtures", name), "utf8"),
  ) as Record<string, unknown>;
}

describe("Creator frozen cross-language contracts", () => {
  it("keeps the AG-UI browser request compatible with the Phase 1 transport", async () => {
    const golden = await fixture("ag-ui-echo.json");
    const request = RunAgentInputSchema.parse(golden.request);

    expect(request).toMatchObject({
      threadId: "creator-thread",
      runId: "creator-run",
    });
    expect(golden.eventTypes).toEqual([
      "RUN_STARTED",
      "TEXT_MESSAGE_START",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_END",
      "RUN_FINISHED",
    ]);
  });

  it("keeps Project Control v2 success and failure envelopes compatible", async () => {
    const golden = await fixture("project-control.json");

    expect(golden.request).toMatchObject({
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

  it("freezes host validation, Fast Path, and receipt golden shapes", async () => {
    const golden = await fixture("creator-host-results.json");

    expect(golden.validation).toMatchObject({
      revision: 2,
      status: "passed",
      checks: [
        { command: "pnpm verify:ui" },
        { command: "pnpm typecheck" },
      ],
    });
    expect(golden.fastPath).toMatchObject({
      handled: true,
      metrics: { generalAgentCalls: 0 },
    });
    expect(golden.receipt).toMatchObject({
      files: [{ path: "app-ui/app-ui.json", status: "modified" }],
      validations: [],
    });
  });
});
