import { describe, expect, it } from "vitest";

import {
  mapAgUiInterrupt,
  mapInterruptResponse,
} from "../src/interrupt-mapper.js";

describe("AG-UI interrupt mapping", () => {
  it("maps complete interrupt data into protocol-independent runtime fields", () => {
    expect(mapAgUiInterrupt({
      id: "approval",
      reason: "tool-approval",
      message: "Approve file deletion?",
      toolCallId: "delete-files",
      responseSchema: {
        type: "object",
        properties: { approved: { type: "boolean" } },
      },
      expiresAt: "2026-09-06T12:00:00Z",
      metadata: { risk: "destructive" },
      subagentRunId: "researcher",
    })).toEqual({
      id: "approval",
      reason: "tool-approval",
      message: "Approve file deletion?",
      producer: { type: "subagent", id: "researcher" },
      toolExecutionId: "delete-files",
      responseSchema: {
        type: "object",
        properties: { approved: { type: "boolean" } },
      },
      expiresAt: "2026-09-06T12:00:00Z",
      metadata: { risk: "destructive" },
    });
  });

  it("maps a minimal root interrupt", () => {
    expect(mapAgUiInterrupt({ id: "input", reason: "human-input" })).toEqual({
      id: "input",
      reason: "human-input",
      producer: { type: "root" },
    });
  });

  it("does not share mutable interrupt payload references", () => {
    const responseSchema = {
      type: "object",
      properties: {
        approved: {
          type: "boolean",
        },
      },
    };
    const metadata = {
      nested: {
        value: 1,
      },
    };

    const mapped = mapAgUiInterrupt({
      id: "approval",
      reason: "tool-approval",
      responseSchema,
      metadata,
    });

    responseSchema.properties.approved.type = "string";
    metadata.nested.value = 2;

    expect(mapped.responseSchema).toEqual({
      type: "object",
      properties: {
        approved: {
          type: "boolean",
        },
      },
    });
    expect(mapped.metadata).toEqual({
      nested: {
        value: 1,
      },
    });

    const mappedResponseSchema = mapped.responseSchema as {
      properties: { approved: { type: string } };
    };
    const mappedMetadata = mapped.metadata as { nested: { value: number } };
    mappedResponseSchema.properties.approved.type = "number";
    mappedMetadata.nested.value = 3;

    expect(responseSchema.properties.approved.type).toBe("string");
    expect(metadata.nested.value).toBe(2);
  });

  it("maps resolved and cancelled responses without adding adapter fields", () => {
    expect(mapInterruptResponse({
      interruptId: "approval",
      status: "resolved",
      payload: { approved: true },
      metadata: { source: "toolbar" },
    })).toEqual({
      interruptId: "approval",
      status: "resolved",
      payload: { approved: true },
      metadata: { source: "toolbar" },
    });
    expect(mapInterruptResponse({
      interruptId: "input",
      status: "cancelled",
    })).toEqual({
      interruptId: "input",
      status: "cancelled",
    });
  });

  it("does not share mutable resume response references", () => {
    const payload = {
      approved: true,
      options: {
        mode: "safe",
      },
    };
    const metadata = {
      source: {
        plugin: "approval-card",
      },
    };

    const mapped = mapInterruptResponse({
      interruptId: "approval",
      status: "resolved",
      payload,
      metadata,
    });

    payload.options.mode = "force";
    metadata.source.plugin = "other";

    expect(mapped.payload).toEqual({
      approved: true,
      options: {
        mode: "safe",
      },
    });
    expect(mapped.metadata).toEqual({
      source: {
        plugin: "approval-card",
      },
    });

    const mappedPayload = mapped.payload as {
      approved: boolean;
      options: { mode: string };
    };
    const mappedMetadata = mapped.metadata as {
      source: { plugin: string };
    };
    mappedPayload.options.mode = "strict";
    mappedMetadata.source.plugin = "system";

    expect(payload.options.mode).toBe("force");
    expect(metadata.source.plugin).toBe("other");
  });
});
