import {
  conversationDetailResponseSchema,
  conversationListResponseSchema,
  type ConversationDetail,
  type ConversationDetailResponse,
} from "./contract";
import type { ConversationDataSource } from "./data-source";

export interface HttpConversationDataSourceOptions {
  endpoint: string;
  fetch?: typeof globalThis.fetch | undefined;
}

function normalizeEndpoint(endpoint: string): string {
  const normalized = endpoint.trim().replace(/\/+$/, "");
  if (normalized.length === 0) {
    throw new Error("Conversation API endpoint must not be blank.");
  }
  return normalized;
}

async function assertResponseOk(response: Response): Promise<void> {
  if (!response.ok) {
    let detail = "";
    try {
      const body: unknown = await response.json();
      if (
        typeof body === "object" &&
        body !== null &&
        "error" in body &&
        typeof body.error === "string"
      ) {
        detail = `: ${body.error}`;
      }
    } catch {
      // The HTTP status remains authoritative when no JSON body exists.
    }
    throw new Error(`Conversation API request failed (${response.status})${detail}`);
  }
}

async function readResponseJson(response: Response): Promise<unknown> {
  await assertResponseOk(response);
  return response.json();
}

function toConversationDetail(
  response: ConversationDetailResponse,
): ConversationDetail {
  return {
    id: response.id,
    title: response.title,
    history: {
      format: "langchain",
      messages: response.state.values.messages ?? [],
    },
    ...(response.agentState === undefined
      ? {}
      : { agentState: response.agentState }),
  };
}

export function createHttpConversationDataSource({
  endpoint,
  fetch: fetchImplementation = globalThis.fetch,
}: HttpConversationDataSourceOptions): ConversationDataSource {
  const baseEndpoint = normalizeEndpoint(endpoint);

  return {
    async delete(id, options) {
      const response = await fetchImplementation(
        `${baseEndpoint}/conversations/${encodeURIComponent(id)}`,
        {
          method: "DELETE",
          ...(options?.signal === undefined ? {} : { signal: options.signal }),
        },
      );
      await assertResponseOk(response);
    },
    async list(options) {
      const response = await fetchImplementation(`${baseEndpoint}/conversations`, {
        method: "GET",
        ...(options?.signal === undefined ? {} : { signal: options.signal }),
      });
      return conversationListResponseSchema.parse(
        await readResponseJson(response),
      ).conversations;
    },
    async get(id, options) {
      const response = await fetchImplementation(
        `${baseEndpoint}/conversations/${encodeURIComponent(id)}`,
        {
          method: "GET",
          ...(options?.signal === undefined ? {} : { signal: options.signal }),
        },
      );
      return toConversationDetail(
        conversationDetailResponseSchema.parse(
          await readResponseJson(response),
        ),
      );
    },
  };
}
