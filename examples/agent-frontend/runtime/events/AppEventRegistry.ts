import type { AgentApplicationEvent } from "@agent-ui/runtime-core";
import { z } from "zod";

import {
  customEventNameSchema,
} from "../../framework/contracts/custom-event-protocol";

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

function formatIssuePath(path: PropertyKey[]): string {
  return path.length === 0 ? "<root>" : path.map(String).join(".");
}

export class AppEventRegistry<
  TSchemas extends AppEventSchemas = AppEventSchemas,
> {
  readonly #schemas: TSchemas;

  constructor(schemas: TSchemas) {
    for (const name of Object.keys(schemas)) {
      const result = customEventNameSchema.safeParse(name);
      if (!result.success) {
        throw new Error(
          `Invalid Custom Event name "${name}": ${
            result.error.issues[0]?.message ?? "invalid event name"
          }`,
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
