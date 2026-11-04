import { readFileSync } from "node:fs";
import { ChatOpenAI, type ChatOpenAIFields } from "@langchain/openai";
import { readCreatorHostEnvironment } from "../creatorRuntimeConfig.js";
import { CreatorChatCompletions } from "./chat-completions.js";
const version = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version as string;

export function hostEnvironment(root?: string): Record<string, string | undefined> {
  const values: Record<string, string | undefined> = readCreatorHostEnvironment(root);
  for (const [key, value] of Object.entries(process.env)) if (value?.trim()) values[key] = value;
  return values;
}

export function createModel(environment: Record<string, string | undefined>, threadId: string) {
  const e = environment;
  const provider = e.CREATOR_MODEL_PROVIDER;
  if (provider && provider !== "openai") throw new Error("CREATOR_MODEL_PROVIDER_UNSUPPORTED");
  const baseURL = e.CREATOR_MODEL_BASE_URL;
  const apiKey = e.CREATOR_MODEL_API_KEY;
  if (!baseURL || !apiKey) throw new Error("CREATOR_MODEL_CONFIGURATION_MISSING");
  const number = (name: string, fallback: number, minimum: number) => {
    const value = Number(e[name] ?? fallback);
    if (!Number.isFinite(value) || value < minimum) throw new Error(`CREATOR_MODEL_CONFIGURATION_INVALID: ${name}`);
    return value;
  };
  const timeout = Math.ceil(number("CREATOR_MODEL_TIMEOUT_SECONDS", 120, 1) * 1000);
  if (!Number.isSafeInteger(timeout) || timeout > 2_147_483_647) throw new Error("CREATOR_MODEL_CONFIGURATION_INVALID: CREATOR_MODEL_TIMEOUT_SECONDS");
  const fields: ChatOpenAIFields = {
    model: e.CREATOR_MODEL_NAME || "mimo-v2.5-pro",
    apiKey, temperature: number("CREATOR_MODEL_TEMPERATURE", 0.2, 0),
    maxTokens: number("CREATOR_MODEL_MAX_TOKENS", 8192, 1),
    timeout,
    maxRetries: 0, streaming: true, useResponsesApi: false,
    configuration: { baseURL, fetch: (request, init) => {
      // The SDK currently replaces default User-Agent headers. Set this through
      // its public fetch seam without changing authorization or request bodies.
      const headers = new Headers(init?.headers);
      headers.set("User-Agent", `agent-ui-creator/${version}`);
      // The SDK's timeout ends after response headers. Keep the configured
      // per-request deadline active while its SSE body is consumed as well.
      // Caller/SDK cancellation still wins when it happens first.
      const sourceSignal = init?.signal ?? (request instanceof Request ? request.signal : undefined);
      const deadline = AbortSignal.timeout(timeout);
      const signal = sourceSignal ? AbortSignal.any([sourceSignal, deadline]) : deadline;
      return fetch(request, { ...init, headers, signal });
    }, defaultHeaders: {
      ...(e.CREATOR_MODEL_OPENCODE_SESSION_HEADER === "1" ? { "x-opencode-session": threadId } : {}),
    } },
  };
  return new ChatOpenAI({ ...fields, completions: new CreatorChatCompletions(fields) });
}
