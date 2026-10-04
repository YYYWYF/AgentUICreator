import { describe, expect, it } from "vitest";

import { classifyCreatorReceiptPresentation } from "../src/ui/creatorConversationPresentation.js";
import type { CreatorRunReceipt } from "../src/receiptTypes.js";

const emptyReceipt: CreatorRunReceipt = {
  files: [],
  validations: [],
  verification: { status: "no-project-change", projectRevision: 0, auditAttempts: 0, checks: [] },
  diagnosticLog: { format: "jsonl", path: ".agentuicreator/logs/run.jsonl" },
};

describe("Creator receipt presentation", () => {
  it("hides empty answers and inspections even when diagnostics exist", () => {
    expect(classifyCreatorReceiptPresentation(emptyReceipt)).toBe("none");
  });

  it("does not infer a mutation from a productized route or mutation attempt", () => {
    const runResult = { creatorIntent: { route: "productized" }, mutationAttempts: 1, receipt: emptyReceipt };
    expect(classifyCreatorReceiptPresentation(runResult.receipt)).toBe("none");
  });

  it("does not need a route to classify an empty or changed receipt", () => {
    expect(classifyCreatorReceiptPresentation(emptyReceipt)).toBe("none");
    expect(classifyCreatorReceiptPresentation({
      ...emptyReceipt,
      files: [{ path: "app-ui/app-ui.json", status: "modified", diff: "updated", truncated: false }],
    })).toBe("mutation");
  });

  it("shows validation commands without claiming a file change", () => {
    expect(classifyCreatorReceiptPresentation({
      ...emptyReceipt,
      validations: [{ command: "pnpm typecheck", status: "passed", exitCode: 0, output: "", truncated: false }],
    })).toBe("validation");
  });
});
