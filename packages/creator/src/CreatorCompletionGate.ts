// Legacy Creator runtime. Do not add new Creator agent capabilities here.
// New agent-control-plane work belongs to creator-python.
import { randomUUID } from "node:crypto";

import { AIMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import type { CreateDeepAgentParams } from "deepagents";

import { CreatorActivityRecorder } from "./CreatorActivityRecorder.js";
import { createCreatorToolCallId } from "./toolCallIds.js";
import type { CreatorVerificationCheck } from "./receiptTypes.js";
import type { CreatorValidationService } from "./validation/CreatorValidationService.js";
import {
  CREATOR_COMPLETION_VALIDATIONS,
  type CreatorValidationResult,
} from "./validation/types.js";

export const CREATOR_COMPLETION_REVIEW_TOOL = "creator_completion_review";

const MAX_VALIDATION_REPAIR_ATTEMPTS = 3;
const MAX_COMPLETION_AUDIT_REJECTIONS = 3;
const READ_ONLY_MARKER = "[creator-verification:read-only]";
const REVISION_MARKER_PATTERN =
  /^\s*\[creator-verification:revision=(\d+)\]\s*/iu;

type CreatorMiddleware = NonNullable<
  CreateDeepAgentParams["middleware"]
>[number];

export interface CreatorCompletionGateOptions {
  activity: CreatorActivityRecorder;
  validationService: Pick<
    CreatorValidationService,
    "ensureCurrentRevisionValidated"
  >;
}

interface GateRejection {
  feedback: string;
}

function cloneWithText(message: AIMessage, text: string): AIMessage {
  return new AIMessage({
    content: text,
    additional_kwargs: message.additional_kwargs,
    response_metadata: message.response_metadata,
    tool_calls: message.tool_calls ?? [],
    invalid_tool_calls: message.invalid_tool_calls ?? [],
    ...(message.id === undefined ? {} : { id: message.id }),
    ...(message.name === undefined ? {} : { name: message.name }),
    ...(message.usage_metadata === undefined
      ? {}
      : { usage_metadata: message.usage_metadata }),
  });
}

function stripReadOnlyMarker(text: string): string | undefined {
  const trimmed = text.trimStart();
  if (!trimmed.toLowerCase().startsWith(READ_ONLY_MARKER)) {
    return undefined;
  }
  return trimmed.slice(READ_ONLY_MARKER.length).trimStart();
}

function stripRevisionMarker(
  text: string,
): { revision: number; text: string } | undefined {
  const match = text.match(REVISION_MARKER_PATTERN);
  const revisionText = match?.[1];
  if (match === null || match === undefined || revisionText === undefined) {
    return undefined;
  }
  return {
    revision: Number.parseInt(revisionText, 10),
    text: text.slice(match[0].length),
  };
}

function validationChecks(
  validation: CreatorValidationResult,
): CreatorVerificationCheck[] {
  return CREATOR_COMPLETION_VALIDATIONS.map((command) => {
    const check = validation.checks.find(
      (candidate) => candidate.command === command,
    );
    return {
      id: command,
      status: check?.status ?? "failed",
      evidence:
        check === undefined
          ? `No validation result exists for revision ${validation.revision}.`
          : `exitCode=${check.exitCode ?? "null"}; revision=${check.revision}; source=${check.source}`,
    };
  });
}

function formatValidationFailureForAgent(
  validation: CreatorValidationResult,
  currentRevision: number,
): string {
  const evidence = validation.checks
    .map((check) => {
      const output = check.output.trim();
      return `${check.command}\n${check.status.toUpperCase()} (exitCode=${check.exitCode ?? "null"}, revision=${check.revision}, source=${check.source}, truncated=${check.truncated})${
        output === "" ? "" : `\n${output}`
      }`;
    })
    .join("\n\n");
  if (validation.status === "stale") {
    return `The Creator Host validation result for project revision ${validation.revision} became stale because the current revision is ${currentRevision}.\n\nHost validation:\n\n${evidence}\n\nReview the current project state and finish the requested repair. Do not manually run Host-owned completion validations. When you believe the current project is ready, submit another candidate completion. The Creator Host will validate the latest revision automatically.`;
  }
  return `The Creator Host validation rejected the candidate for project revision ${validation.revision}.\n\nHost validation:\n\n${evidence}\n\nFix the current project based on this evidence. Do not manually run Host-owned completion validations. When you believe the project is fixed, submit another candidate completion. The Creator Host will validate the latest revision automatically.`;
}

export class CreatorCompletionGate {
  private readonly activity: CreatorActivityRecorder;
  private readonly validationService: Pick<
    CreatorValidationService,
    "ensureCurrentRevisionValidated"
  >;
  private readonly pendingFeedback = new Map<string, string>();
  private observedRunId: string | undefined;
  private validationRepairCount = 0;
  private completionAuditRejectionCount = 0;

  constructor({ activity, validationService }: CreatorCompletionGateOptions) {
    this.activity = activity;
    this.validationService = validationService;
  }

  consumeFeedback(token: string): string {
    const feedback = this.pendingFeedback.get(token);
    if (feedback === undefined) {
      return "The completion review token is no longer valid.";
    }
    this.pendingFeedback.delete(token);
    return feedback;
  }

  async review(message: AIMessage): Promise<AIMessage> {
    this.synchronizeRun();

    if ((message.tool_calls?.length ?? 0) > 0) {
      return message;
    }

    const initialReceipt = await this.activity.snapshot();
    if (initialReceipt.files.length === 0) {
      return this.reviewNoChange(message);
    }

    const validation =
      await this.validationService.ensureCurrentRevisionValidated();
    const receipt = await this.activity.snapshot();
    if (validation.status !== "passed") {
      return this.rejectOrFail(message, {
        feedback: formatValidationFailureForAgent(
          validation,
          this.activity.revision,
        ),
      }, "validation");
    }

    const marked = stripRevisionMarker(message.text);
    if (
      marked !== undefined &&
      marked.revision === this.activity.revision &&
      marked.text.trim() !== ""
    ) {
      const checks: CreatorVerificationCheck[] = [
        {
          id: "net-project-change",
          status: "passed",
          evidence: `${receipt.files.length} net changed file(s).`,
        },
        ...validationChecks(validation),
        {
          id: "same-model-completion-audit",
          status: "passed",
          evidence: `The candidate was audited against revision ${this.activity.revision}.`,
        },
      ];
      this.activity.recordVerification({
        status: "changed-and-verified",
        projectRevision: this.activity.revision,
        auditAttempts: this.completionAuditRejectionCount,
        checks,
      });
      return cloneWithText(message, marked.text);
    }

    const files = receipt.files
      .map((file) => `- ${file.status}: ${file.path}\n${file.diff}`)
      .join("\n");
    const validations = CREATOR_COMPLETION_VALIDATIONS.map((command) => {
      const check = validation.checks.find(
        (candidate) => candidate.command === command,
      );
      return `- ${command}: ${check?.status ?? "missing"}${
        check?.output.trim() ? `\n${check.output.trim()}` : ""
      }`;
    }).join("\n");

    return this.rejectOrFail(message, {
      feedback: `The hard checks passed for project revision ${this.activity.revision}, but this revision still needs a completion audit.\n\nNet project changes:\n${files}\n\nHost-observed validation:\n${validations}\n\nRe-read the original user request and compare it with the actual current files and evidence above. If anything is incomplete, continue using tools. If the request is fully satisfied, respond with the final user-facing report starting exactly with:\n[creator-verification:revision=${this.activity.revision}]\n\nDo not include that marker unless you have completed this audit.`,
    }, "audit");
  }

  private async reviewNoChange(message: AIMessage): Promise<AIMessage> {
    const readOnlyText = stripReadOnlyMarker(message.text);
    if (readOnlyText !== undefined && readOnlyText.trim() !== "") {
      this.activity.recordVerification({
        status: "no-project-change",
        projectRevision: this.activity.revision,
        auditAttempts: this.completionAuditRejectionCount,
        checks: [
          {
            id: "net-project-change",
            status: "passed",
            evidence: "No net file change was required by the read-only request.",
          },
          {
            id: "same-model-completion-audit",
            status: "passed",
            evidence: "The model explicitly confirmed that the request was read-only.",
          },
        ],
      });
      return cloneWithText(message, readOnlyText);
    }

    return this.rejectOrFail(message, {
      feedback: `The Creator completion gate found no net project file changes.\n\nReview the original user request before stopping:\n- If the request asked you to change the Agent frontend, continue using tools and verify the actual result. Discovering an existing Plugin or describing a solution is not a project change.\n- If the request was genuinely read-only, answer it again and start the final response exactly with:\n${READ_ONLY_MARKER}\n\nThe marker is a host protocol and will be removed before the response is shown to the user.`,
    }, "audit");
  }

  private rejectOrFail(
    candidate: AIMessage,
    rejection: GateRejection,
    kind: "validation" | "audit",
  ): AIMessage {
    if (kind === "validation") {
      this.validationRepairCount += 1;
    } else {
      this.completionAuditRejectionCount += 1;
    }
    const attempts =
      kind === "validation"
        ? this.validationRepairCount
        : this.completionAuditRejectionCount;
    const maximum =
      kind === "validation"
        ? MAX_VALIDATION_REPAIR_ATTEMPTS
        : MAX_COMPLETION_AUDIT_REJECTIONS;
    if (attempts > maximum) {
      this.activity.recordVerification({
        status: "failed",
        projectRevision: this.activity.revision,
        auditAttempts: this.completionAuditRejectionCount,
        checks: [
          {
            id: "completion-gate",
            status: "failed",
            evidence: rejection.feedback,
          },
        ],
      });
      return cloneWithText(
        candidate,
        kind === "validation"
          ? "无法确认本次修改已经完成：Creator Host 在三次修复后仍未获得当前项目 revision 的完整验证证据。请查看修改回执中的失败证据。"
          : "无法确认本次修改已经完成：Creator 在三次完成复核后仍未满足当前项目 revision 的验证要求。请查看修改回执中的失败证据。",
      );
    }

    const token = randomUUID();
    this.pendingFeedback.set(token, rejection.feedback);
    return new AIMessage({
      content: "",
      tool_calls: [
        {
          id: createCreatorToolCallId(),
          name: CREATOR_COMPLETION_REVIEW_TOOL,
          args: { token },
          type: "tool_call",
        },
      ],
    });
  }

  private synchronizeRun(): void {
    if (this.observedRunId === this.activity.runId) {
      return;
    }
    this.observedRunId = this.activity.runId;
    this.validationRepairCount = 0;
    this.completionAuditRejectionCount = 0;
    this.pendingFeedback.clear();
  }
}

export function createCreatorCompletionGateMiddleware(
  gate: CreatorCompletionGate,
): CreatorMiddleware {
  const completionReviewTool = tool(
    async (input: { token: string }) => gate.consumeFeedback(input.token),
    {
      name: CREATOR_COMPLETION_REVIEW_TOOL,
      description:
        "Internal Creator Harness review evidence. Only call this tool when the Harness has emitted the tool call.",
      schema: {
        type: "object",
        properties: { token: { type: "string", format: "uuid" } },
        required: ["token"],
        additionalProperties: false,
      },
    },
  );

  return {
    name: "creator-completion-gate",
    tools: [completionReviewTool],
    async wrapModelCall(request, handler) {
      return gate.review(await handler(request));
    },
  };
}
