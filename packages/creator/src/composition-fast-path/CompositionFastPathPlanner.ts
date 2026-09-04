import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import type { CreatorRunLogger } from "../CreatorRunLogger.js";
import type {
  CompositionFastPathPlan,
  CompositionIntent,
  CompositionPlannerFallbackReason,
  CompositionSummary,
} from "./types.js";

const COMPOSITION_PLANNER_TIMEOUT_MS = 15_000;

const plannerSchema = {
  type: "object",
  oneOf: [
    {
      type: "object",
      properties: {
        mode: { const: "composition" },
        intents: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          items: {
            oneOf: [
              ...["remove", "enable", "disable", "unmount"].map((action) => ({
                type: "object",
                properties: {
                  action: { const: action },
                  target: { type: "string", minLength: 1, maxLength: 200 },
                },
                required: ["action", "target"],
                additionalProperties: false,
              })),
              ...["mount", "move"].map((action) => ({
                type: "object",
                properties: {
                  action: { const: action },
                  target: { type: "string", minLength: 1, maxLength: 200 },
                  destination: {
                    type: "string",
                    minLength: 1,
                    maxLength: 200,
                  },
                },
                required: ["action", "target", "destination"],
                additionalProperties: false,
              })),
            ],
          },
        },
      },
      required: ["mode", "intents"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        mode: { const: "fallback" },
        reason: {
          enum: [
            "not_composition_request",
            "unsupported_action",
            "requires_source_change",
          ],
        },
      },
      required: ["mode", "reason"],
      additionalProperties: false,
    },
  ],
} as const;

const PLANNER_SYSTEM_PROMPT = `You are a conservative routing classifier for an Agent UI composition editor.

Choose composition mode only when the entire user request can be satisfied by one or more of these instance-level actions: remove, enable, disable, mount, unmount, move.

Return fallback when any part requires source code, TS/TSX/CSS, plugin behavior or manifest changes, props, new plugins, layout design, visual implementation, business logic, or uncertain interpretation. Prefer fallback over guessing.

For composition intents, copy a natural target phrase and destination phrase from the user's wording. Do not emit fields named instanceId or slotId, and do not translate user wording into internal identifiers. Do not plan, inspect files, call tools, or repair your answer. Produce exactly one structured response.`;

const fallbackReasons = new Set<CompositionPlannerFallbackReason>([
  "not_composition_request",
  "unsupported_action",
  "requires_source_change",
]);
const simpleActions = new Set<CompositionIntent["action"]>([
  "remove",
  "enable",
  "disable",
  "unmount",
]);
const destinationActions = new Set<CompositionIntent["action"]>([
  "mount",
  "move",
]);

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function boundedText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text !== "" && text.length <= 200 ? text : undefined;
}

export function parseCompositionFastPathPlan(
  value: unknown,
): CompositionFastPathPlan | undefined {
  const source = record(value);
  if (source?.mode === "fallback") {
    return Object.keys(source).every((key) => ["mode", "reason"].includes(key)) &&
      typeof source.reason === "string" &&
      fallbackReasons.has(source.reason as CompositionPlannerFallbackReason)
      ? {
          mode: "fallback",
          reason: source.reason as CompositionPlannerFallbackReason,
        }
      : undefined;
  }
  if (source?.mode !== "composition" || !Array.isArray(source.intents)) {
    return undefined;
  }
  if (Object.keys(source).some((key) => !["mode", "intents"].includes(key))) {
    return undefined;
  }
  if (source.intents.length === 0 || source.intents.length > 20) {
    return undefined;
  }
  const intents: CompositionIntent[] = [];
  for (const value of source.intents) {
    const intent = record(value);
    const action = intent?.action;
    const target = boundedText(intent?.target);
    if (typeof action !== "string" || target === undefined) return undefined;
    if (simpleActions.has(action as CompositionIntent["action"])) {
      if (Object.keys(intent).some((key) => !["action", "target"].includes(key))) {
        return undefined;
      }
      intents.push({ action: action as "remove" | "enable" | "disable" | "unmount", target });
      continue;
    }
    if (destinationActions.has(action as CompositionIntent["action"])) {
      const destination = boundedText(intent.destination);
      if (
        destination === undefined ||
        Object.keys(intent).some(
          (key) => !["action", "target", "destination"].includes(key),
        )
      ) {
        return undefined;
      }
      intents.push({ action: action as "mount" | "move", target, destination });
      continue;
    }
    return undefined;
  }
  return { mode: "composition", intents };
}

export class CompositionFastPathPlanner {
  constructor(
    private readonly model: BaseChatModel,
    private readonly runLogger?: CreatorRunLogger | undefined,
  ) {}

  async plan(
    userRequest: string,
    composition: CompositionSummary,
    signal?: AbortSignal | undefined,
  ): Promise<CompositionFastPathPlan> {
    const input = [
      new SystemMessage(PLANNER_SYSTEM_PROMPT),
      new HumanMessage(
        JSON.stringify({
          userRequest,
          compositionSummary: composition,
        }),
      ),
    ];
    await this.runLogger?.record("fast_path_planner_request", {
      userRequest,
      compositionSummary: composition,
    });
    const startedAt = Date.now();
    const controller = new AbortController();
    const onAbort = (): void => controller.abort(signal?.reason);
    if (signal?.aborted) onAbort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const timeout = setTimeout(
      () => controller.abort(new Error("Composition Fast Path Planner timed out.")),
      COMPOSITION_PLANNER_TIMEOUT_MS,
    );
    try {
      const runnable = this.model.withStructuredOutput<Record<string, unknown>>(
        plannerSchema,
        { name: "composition_fast_path_plan", method: "functionCalling" },
      );
      const output = await runnable.invoke(input, {
        signal: controller.signal,
      });
      const plan = parseCompositionFastPathPlan(output);
      if (plan === undefined) {
        throw new Error("Composition Fast Path Planner returned an invalid plan.");
      }
      await this.runLogger?.record("fast_path_planner_response", {
        durationMs: Date.now() - startedAt,
        plan,
      });
      return plan;
    } catch (error) {
      await this.runLogger?.record("fast_path_planner_error", {
        durationMs: Date.now() - startedAt,
        error,
      });
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    }
  }
}
