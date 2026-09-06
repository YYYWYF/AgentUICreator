import type { AgentApplicationEvent } from "@agent-ui/runtime-core";
import { z } from "zod";

export type AppEventSchemas = Readonly<Record<string, z.ZodTypeAny>>;

export type AppEventDecodeResult =
  | {
      ok: true;
      event: AgentApplicationEvent;
    }
  | {
      ok: false;
      reason: "unknown-event" | "invalid-payload";
      eventName: string;
      issuePaths?: readonly string[] | undefined;
    };

const APPLICATION_EVENT_NAME_PATTERN =
  /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/u;

const RESERVED_STANDARD_EVENT_NAMES = new Set([
  "tool.started",
  "tool.finished",
  "reasoning.started",
  "reasoning.finished",
  "step.started",
  "step.finished",
  "subagent.started",
  "subagent.finished",
  "run.started",
  "run.finished",
  "run.error",
  "interrupt.requested",
  "interrupt.resolved",
  "message.delta",
  "state.changed",
]);

function formatIssuePath(path: PropertyKey[]): string {
  return path.length === 0 ? "<root>" : path.map(String).join(".");
}

export class AppEventRegistry<
  TSchemas extends AppEventSchemas = AppEventSchemas,
> {
  readonly #schemas: TSchemas;

  constructor(schemas: TSchemas) {
    for (const name of Object.keys(schemas)) {
      if (!APPLICATION_EVENT_NAME_PATTERN.test(name)) {
        throw new Error(
          `Application event name "${name}" must be lowercase dot-separated text`,
        );
      }
      if (RESERVED_STANDARD_EVENT_NAMES.has(name)) {
        throw new Error(
          `Application event "${name}" duplicates a standard Agent Runtime semantic`,
        );
      }
    }
    this.#schemas = schemas;
  }

  has(name: string): boolean {
    return Object.hasOwn(this.#schemas, name);
  }

  decode(event: AgentApplicationEvent): AppEventDecodeResult {
    const schema = this.#schemas[event.name];
    if (schema === undefined) {
      return {
        ok: false,
        reason: "unknown-event",
        eventName: event.name,
      };
    }

    const result = schema.safeParse(event.payload);
    if (!result.success) {
      return {
        ok: false,
        reason: "invalid-payload",
        eventName: event.name,
        issuePaths: result.error.issues.map((issue) =>
          formatIssuePath(issue.path),
        ),
      };
    }

    return {
      ok: true,
      event: {
        name: event.name,
        payload: result.data,
        producer: event.producer,
      },
    };
  }
}
