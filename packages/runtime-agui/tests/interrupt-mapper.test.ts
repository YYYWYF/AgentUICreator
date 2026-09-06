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
});
