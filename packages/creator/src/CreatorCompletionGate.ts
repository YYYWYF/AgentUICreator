import { randomUUID } from "node:crypto";

import { AIMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import type { CreateDeepAgentParams } from "deepagents";

import { CreatorActivityRecorder } from "./CreatorActivityRecorder.js";
import { ProjectCommandBackend } from "./ProjectCreatorBackend.js";
import { createCreatorToolCallId } from "./toolCallIds.js";
import type {
  CreatorRunReceipt,
  CreatorVerificationCheck,
} from "./receiptTypes.js";

export const CREATOR_COMPLETION_REVIEW_TOOL = "creator_completion_review";

const REQUIRED_COMPLETION_VALIDATIONS = [
  "pnpm verify:ui",
  "pnpm typecheck",
] as const;
const MAX_COMPLETION_REJECTIONS = 3;
const READ_ONLY_MARKER = "[creator-verification:read-only]";
const REVISION_MARKER_PATTERN =
  /^\s*\[creator-verification:revision=(\d+)\]\s*/iu;

type CreatorMiddleware = NonNullable<
  CreateDeepAgentParams["middleware"]
>[number];

export interface CreatorCompletionGateOptions {
  activity: CreatorActivityRecorder;
  projectRoot: string;
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
  receipt: CreatorRunReceipt,
  revision: number,
): CreatorVerificationCheck[] {
  return REQUIRED_COMPLETION_VALIDATIONS.map((command) => {
    const validation = [...receipt.validations]
      .reverse()
      .find(
        (candidate) =>
          candidate.command === command &&
          candidate.revision === revision,
      );
    return {
      id: command,
      status: validation?.status ?? "failed",
      evidence:
        validation === undefined
          ? `No validation result exists for revision ${revision}.`
          : `exitCode=${validation.exitCode ?? "null"}; revision=${validation.revision}`,
    };
  });
}

export class CreatorCompletionGate {
  private readonly activity: CreatorActivityRecorder;
  private readonly commands: ProjectCommandBackend;
  private readonly pendingFeedback = new Map<string, string>();
  private observedRunId: string | undefined;
  private rejectionCount = 0;

  constructor({ activity, projectRoot }: CreatorCompletionGateOptions) {
    this.activity = activity;
    this.commands = new ProjectCommandBackend({ projectRoot, activity });
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

    await this.ensureCurrentValidations();
    const receipt = await this.activity.snapshot();
    const failedValidations = REQUIRED_COMPLETION_VALIDATIONS.flatMap(
      (command) => {
        const validation = this.activity.validationAtCurrentRevision(command);
        return validation?.status === "passed" ? [] : [validation];
      },
    );

    if (failedValidations.length > 0) {
      const evidence = REQUIRED_COMPLETION_VALIDATIONS.map((command) => {
        const validation = this.activity.validationAtCurrentRevision(command);
        if (validation === undefined) {
          return `- ${command}: not run for revision ${this.activity.revision}`;
        }
        const output = validation.output.trim();
        return `- ${command}: ${validation.status} at revision ${validation.revision}${
          output === "" ? "" : `\n${output}`
        }`;
      }).join("\n");

      return this.rejectOrFail(message, {
        feedback: `The Creator completion gate rejected the candidate response.\n\nThe current project revision is ${this.activity.revision}, and required validation did not pass:\n${evidence}\n\nUse the available tools to fix the current project. Do not claim completion or emit a creator-verification marker until both validations pass for the latest revision.`,
      });
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
        ...validationChecks(receipt, this.activity.revision),
        {
          id: "same-model-completion-audit",
          status: "passed",
          evidence: `The candidate was audited against revision ${this.activity.revision}.`,
        },
      ];
      this.activity.recordVerification({
        status: "changed-and-verified",
        projectRevision: this.activity.revision,
        auditAttempts: this.rejectionCount,
        checks,
      });
      return cloneWithText(message, marked.text);
    }

    const files = receipt.files
      .map((file) => `- ${file.status}: ${file.path}\n${file.diff}`)
      .join("\n");
    const validations = REQUIRED_COMPLETION_VALIDATIONS.map((command) => {
      const validation = this.activity.validationAtCurrentRevision(command);
      return `- ${command}: ${validation?.status ?? "missing"}${
        validation?.output.trim() ? `\n${validation.output.trim()}` : ""
      }`;
    }).join("\n");

    return this.rejectOrFail(message, {
      feedback: `The hard checks passed for project revision ${this.activity.revision}, but this revision still needs a completion audit.\n\nNet project changes:\n${files}\n\nHost-observed validation:\n${validations}\n\nRe-read the original user request and compare it with the actual current files and evidence above. If anything is incomplete, continue using tools. If the request is fully satisfied, respond with the final user-facing report starting exactly with:\n[creator-verification:revision=${this.activity.revision}]\n\nDo not include that marker unless you have completed this audit.`,
    });
  }

  private async reviewNoChange(message: AIMessage): Promise<AIMessage> {
    const readOnlyText = stripReadOnlyMarker(message.text);
    if (readOnlyText !== undefined && readOnlyText.trim() !== "") {
      this.activity.recordVerification({
        status: "no-project-change",
        projectRevision: this.activity.revision,
        auditAttempts: this.rejectionCount,
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
    });
  }

  private async ensureCurrentValidations(): Promise<void> {
    for (const command of REQUIRED_COMPLETION_VALIDATIONS) {
      if (this.activity.validationAtCurrentRevision(command) === undefined) {
        await this.commands.execute(command);
      }
    }
  }

  private rejectOrFail(
    candidate: AIMessage,
    rejection: GateRejection,
  ): AIMessage {
    this.rejectionCount += 1;
    if (this.rejectionCount > MAX_COMPLETION_REJECTIONS) {
      this.activity.recordVerification({
        status: "failed",
        projectRevision: this.activity.revision,
        auditAttempts: this.rejectionCount - 1,
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
        "无法确认本次修改已经完成：Creator 在三次完成复核后仍未满足当前项目 revision 的验证要求。请查看修改回执中的失败证据。",
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
    this.rejectionCount = 0;
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
