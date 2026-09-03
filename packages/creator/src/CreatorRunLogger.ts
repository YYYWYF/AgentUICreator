import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  AIMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import type { CreateDeepAgentParams } from "deepagents";

import type { CreatorActivityRecorder } from "./CreatorActivityRecorder.js";
import type {
  CreatorDiagnosticLogReceipt,
  CreatorRunReceipt,
} from "./receiptTypes.js";

export const CREATOR_DIAGNOSTIC_DIRECTORY = ".agentuicreator";
export const CREATOR_DIAGNOSTIC_LOG_SCHEMA_VERSION = 1 as const;

const MAX_LOG_STRING_CHARACTERS = 50_000;
const SECRET_PROPERTY_PATTERN =
  /(?:^(?:authorization|cookie|password|secret|token)$|(?:^|[_-])(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)$)/iu;
const ENV_SECRET_PATTERN =
  /\b([A-Z][A-Z0-9_]*(?:API_KEY|ACCESS_TOKEN|REFRESH_TOKEN|SECRET|PASSWORD))\s*([:=])\s*([^\s,;]+)/gu;
const BEARER_SECRET_PATTERN = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/giu;
const OPENAI_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]{12,}\b/gu;

type CreatorMiddleware = NonNullable<
  CreateDeepAgentParams["middleware"]
>[number];

export type CreatorRunLogSource = "ag-ui" | "session";
export type CreatorRunLogOutcome = "success" | "error" | "aborted";

export interface CreatorRunLoggerOptions {
  projectRoot: string;
  modelName?: string | undefined;
}

export interface CreatorRunLogStart {
  source: CreatorRunLogSource;
  runId: string;
  threadId?: string | undefined;
  messages: unknown[];
}

interface ActiveCreatorLog {
  absolutePath: string;
  reference: CreatorDiagnosticLogReceipt;
  runId: string;
  source: CreatorRunLogSource;
  threadId?: string | undefined;
}

function redactDiagnosticText(source: string): string {
  const redacted = source
    .replace(ENV_SECRET_PATTERN, "$1$2[REDACTED]")
    .replace(BEARER_SECRET_PATTERN, "Bearer [REDACTED]")
    .replace(OPENAI_KEY_PATTERN, "sk-[REDACTED]");

  return redacted.length <= MAX_LOG_STRING_CHARACTERS
    ? redacted
    : `${redacted.slice(0, MAX_LOG_STRING_CHARACTERS)}\n… diagnostic value truncated`;
}

function diagnosticJsonReplacer(): (key: string, value: unknown) => unknown {
  const seen = new WeakSet<object>();

  return (key, value) => {
    if (SECRET_PROPERTY_PATTERN.test(key)) {
      return "[REDACTED]";
    }
    if (typeof value === "string") {
      return redactDiagnosticText(value);
    }
    if (typeof value === "bigint") {
      return value.toString();
    }
    if (value instanceof Error) {
      return {
        name: value.name,
        message: redactDiagnosticText(value.message),
        ...(value.stack === undefined
          ? {}
          : { stack: redactDiagnosticText(value.stack) }),
      };
    }
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) {
        return "[Circular]";
      }
      seen.add(value);
    }
    return value;
  };
}

function messageType(message: BaseMessage): string {
  return message._getType();
}

function serializeMessage(message: BaseMessage): Record<string, unknown> {
  const serialized: Record<string, unknown> = {
    type: messageType(message),
    content: message.content,
    additionalKwargs: message.additional_kwargs,
    responseMetadata: message.response_metadata,
  };

  if (message.id !== undefined) {
    serialized.id = message.id;
  }
  if (message.name !== undefined) {
    serialized.name = message.name;
  }
  if (AIMessage.isInstance(message)) {
    serialized.toolCalls = message.tool_calls ?? [];
    serialized.invalidToolCalls = message.invalid_tool_calls ?? [];
    serialized.usageMetadata = message.usage_metadata;
  }
  if (ToolMessage.isInstance(message)) {
    serialized.toolCallId = message.tool_call_id;
    serialized.status = message.status;
  }
  return serialized;
}

function toolDescriptors(tools: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(tools)) {
    return [];
  }
  return tools.map((candidate) => {
    if (typeof candidate !== "object" || candidate === null) {
      return { value: String(candidate) };
    }
    const tool = candidate as { name?: unknown; description?: unknown };
    return {
      ...(typeof tool.name === "string" ? { name: tool.name } : {}),
      ...(typeof tool.description === "string"
        ? { description: tool.description }
        : {}),
    };
  });
}

function safePathSegment(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .replace(/[^A-Za-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
  return normalized === "" ? "run" : normalized;
}

function diagnosticFileTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/gu, "-");
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class CreatorRunLogger {
  private readonly projectRoot: string;
  private readonly modelName: string | undefined;
  private active: ActiveCreatorLog | undefined;
  private sequence = 0;
  private modelCallSequence = 0;
  private warned = false;

  constructor({ projectRoot, modelName }: CreatorRunLoggerOptions) {
    this.projectRoot = path.resolve(projectRoot);
    this.modelName = modelName;
  }

  async begin(start: CreatorRunLogStart): Promise<void> {
    this.active = undefined;
    this.sequence = 0;
    this.modelCallSequence = 0;
    this.warned = false;

    const logRoot = path.join(
      this.projectRoot,
      CREATOR_DIAGNOSTIC_DIRECTORY,
      "logs",
    );
    const relativePath = path.posix.join(
      CREATOR_DIAGNOSTIC_DIRECTORY,
      "logs",
      `${diagnosticFileTimestamp(new Date())}_${safePathSegment(start.runId)}.jsonl`,
    );

    try {
      await mkdir(logRoot, { recursive: true });
      try {
        await writeFile(
          path.join(this.projectRoot, CREATOR_DIAGNOSTIC_DIRECTORY, ".gitignore"),
          "*\n",
          { encoding: "utf8", flag: "wx" },
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
          throw error;
        }
      }

      this.active = {
        absolutePath: path.join(this.projectRoot, ...relativePath.split("/")),
        reference: {
          format: "jsonl",
          path: relativePath,
          schemaVersion: CREATOR_DIAGNOSTIC_LOG_SCHEMA_VERSION,
        },
        runId: start.runId,
        source: start.source,
        ...(start.threadId === undefined ? {} : { threadId: start.threadId }),
      };
      await this.record("run_started", {
        messages: start.messages,
        modelName: this.modelName,
        privacy:
          "Local diagnostic log. It may contain user prompts, project content, and tool output; review it before sharing.",
      });
    } catch (error) {
      this.disable(error);
    }
  }

  nextModelCallIndex(): number {
    this.modelCallSequence += 1;
    return this.modelCallSequence;
  }

  reference(): CreatorDiagnosticLogReceipt | undefined {
    return this.active === undefined
      ? undefined
      : { ...this.active.reference };
  }

  async record(type: string, data: unknown): Promise<void> {
    const active = this.active;
    if (active === undefined) {
      return;
    }

    this.sequence += 1;
    const entry = {
      schemaVersion: CREATOR_DIAGNOSTIC_LOG_SCHEMA_VERSION,
      sequence: this.sequence,
      timestamp: new Date().toISOString(),
      type,
      runId: active.runId,
      source: active.source,
      ...(active.threadId === undefined ? {} : { threadId: active.threadId }),
      data,
    };

    try {
      await appendFile(
        active.absolutePath,
        `${JSON.stringify(entry, diagnosticJsonReplacer())}\n`,
        "utf8",
      );
    } catch (error) {
      this.disable(error);
    }
  }

  async finish(
    outcome: CreatorRunLogOutcome,
    data: {
      finalMessage?: string | undefined;
      receipt?: CreatorRunReceipt | undefined;
      error?: unknown;
    },
  ): Promise<void> {
    await this.record("run_finished", {
      outcome,
      ...(data.finalMessage === undefined
        ? {}
        : { finalMessage: data.finalMessage }),
      ...(data.receipt === undefined ? {} : { receipt: data.receipt }),
      ...(data.error === undefined ? {} : { error: data.error }),
    });
  }

  private disable(error: unknown): void {
    this.active = undefined;
    if (!this.warned) {
      this.warned = true;
      console.warn(`Creator 诊断日志写入失败：${errorText(error)}`);
    }
  }
}

export function withCreatorDiagnosticLog(
  receipt: CreatorRunReceipt,
  logger: CreatorRunLogger | undefined,
): CreatorRunReceipt {
  const diagnosticLog = logger?.reference();
  return diagnosticLog === undefined
    ? receipt
    : { ...receipt, diagnosticLog };
}

export function createCreatorRunLoggerMiddleware(
  logger: CreatorRunLogger,
  activity?: CreatorActivityRecorder | undefined,
): CreatorMiddleware {
  return {
    name: "creator-run-logger",
    async wrapModelCall(request, handler) {
      const modelCallIndex = logger.nextModelCallIndex();
      const startedAt = Date.now();
      await logger.record("model_request", {
        modelCallIndex,
        projectRevision: activity?.revision,
        messages: request.messages.map(serializeMessage),
        systemPrompt:
          request.systemPrompt ?? request.systemMessage?.content ?? null,
        tools: toolDescriptors(request.tools),
      });

      try {
        const response = await handler(request);
        await logger.record("model_response", {
          modelCallIndex,
          projectRevision: activity?.revision,
          durationMs: Date.now() - startedAt,
          message: serializeMessage(response),
        });
        return response;
      } catch (error) {
        await logger.record("model_error", {
          modelCallIndex,
          projectRevision: activity?.revision,
          durationMs: Date.now() - startedAt,
          error,
        });
        throw error;
      }
    },
    async wrapToolCall(request, handler) {
      const startedAt = Date.now();
      await logger.record("tool_call_started", {
        projectRevision: activity?.revision,
        toolCall: request.toolCall,
      });

      try {
        const result = await handler(request);
        await logger.record("tool_call_finished", {
          projectRevision: activity?.revision,
          durationMs: Date.now() - startedAt,
          toolCall: request.toolCall,
          result: ToolMessage.isInstance(result)
            ? serializeMessage(result)
            : result,
        });
        return result;
      } catch (error) {
        await logger.record("tool_call_error", {
          projectRevision: activity?.revision,
          durationMs: Date.now() - startedAt,
          toolCall: request.toolCall,
          error,
        });
        throw error;
      }
    },
  };
}
