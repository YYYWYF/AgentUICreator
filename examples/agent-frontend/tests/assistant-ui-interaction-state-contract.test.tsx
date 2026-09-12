import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import appUIJson from "../app-ui/app-ui.json";
import {
  deriveToolActivityStatus,
  projectReasoningStatus,
  projectToolPresentationStatus,
} from "../agent-ui/adapters/assistant-ui/slots/AssistantUiMessageSlotAdapters";
import {
  parseAppUIModel,
} from "../framework/contracts/app-ui-model";
import {
  resolveAssistantUiPresentationConfig,
} from "../agent-ui/adapters/assistant-ui/config";
import type { ToolPresentationItem } from "../runtime/message-rendering";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function toolItem(
  id: string,
  status: ToolPresentationItem["status"],
  actionRequirement?: ToolPresentationItem["actionRequirement"],
): ToolPresentationItem {
  return {
    toolCall: {
      id,
      type: "function",
      function: { name: id, arguments: "{}" },
    },
    status,
    ...(actionRequirement === undefined ? {} : { actionRequirement }),
  };
}

describe("assistant-ui interaction state contract", () => {
  it("normalizes reasoning terminal causes without losing error state", () => {
    expect(projectReasoningStatus({ type: "running" })).toBe("running");
    expect(projectReasoningStatus({ type: "complete" })).toBe("completed");
    expect(
      projectReasoningStatus({ type: "incomplete", reason: "error" }),
    ).toBe("error");
    expect(
      projectReasoningStatus({ type: "incomplete", reason: "cancelled" }),
    ).toBe("interrupted");
  });

  it("uses assistant-ui ToolCall status as the authoritative projection", () => {
    expect(projectToolPresentationStatus({ type: "running" }, false)).toBe(
      "loading",
    );
    expect(projectToolPresentationStatus({ type: "complete" }, false)).toBe(
      "success",
    );
    expect(projectToolPresentationStatus({ type: "complete" }, true)).toBe(
      "error",
    );
    expect(
      projectToolPresentationStatus(
        { type: "incomplete", reason: "error" },
        false,
      ),
    ).toBe("error");
    expect(
      projectToolPresentationStatus(
        { type: "incomplete", reason: "cancelled" },
        false,
      ),
    ).toBe("abort");
    expect(
      projectToolPresentationStatus(
        { type: "requires-action", reason: "tool-calls" },
        false,
      ),
    ).toBe("loading");
  });

  it("keeps active execution separate from required user action", () => {
    const derived = deriveToolActivityStatus([
      toolItem("running-tool", "loading"),
      toolItem("approval-tool", "loading", { reason: "tool-calls" }),
      toolItem("complete-tool", "success"),
    ]);

    expect(derived.status).toBe("requires-action");
    expect(derived.activeToolCallIds).toEqual(["running-tool"]);
    expect(derived.requiresActionToolCallIds).toEqual(["approval-tool"]);
  });

  it("keeps the upstream Tool Group presentation default explicit and scoped", async () => {
    const model = parseAppUIModel(appUIJson);
    expect(resolveAssistantUiPresentationConfig(model).interactions).toEqual({
      toolGroupVariant: "ghost",
    });

    const adapter = await readFile(
      path.join(
        projectRoot,
        "agent-ui/adapters/assistant-ui/slots/AssistantUiMessageSlotAdapters.tsx",
      ),
      "utf8",
    );
    expect(adapter).toContain('if (props.status.type === "requires-action") return fallback;');
    expect(adapter).toContain("active={activeToolCallIds.length > 0}");

    const sourceStyles = await readFile(
      path.join(projectRoot, "plugins/agent-message-sources/styles.css"),
      "utf8",
    );
    expect(sourceStyles).toContain(
      '.agent-ui-assistant-ui [data-ui-plugin="agent-message-sources"]',
    );
    expect(sourceStyles).toContain("var(--foreground)");
    expect(sourceStyles).not.toMatch(/#[0-9a-f]{3,8}\b/iu);
  });
});
