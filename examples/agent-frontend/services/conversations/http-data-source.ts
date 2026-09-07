import type { AgentMessage } from "../../framework/contracts/ui-plugin";
import {
  conversationDetailResponseSchema,
  conversationListResponseSchema,
  type ConversationDetailResponse,
  type ConversationHistoryMessageDto,
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

async function readResponseJson(response: Response): Promise<unknown> {
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
  return response.json();
}

function toAgentMessage(
  conversationId: string,
  dto: ConversationHistoryMessageDto,
): AgentMessage {
  const common = {
    id: dto.id,
    producer: { type: "root" as const },
    metadata: {
      ...dto.metadata,
      conversationId,
    },
  };
  switch (dto.role) {
    case "user":
      return { ...common, role: "user", content: dto.content };
    case "assistant":
      return { ...common, role: "assistant", content: dto.content };
    case "system":
      return { ...common, role: "system", content: dto.content };
    case "developer":
      return { ...common, role: "developer", content: dto.content };
  }
}

function toConversationDetail(response: ConversationDetailResponse) {
  return {
    id: response.id,
    title: response.title,
    messages: response.messages.map((message) =>
      toAgentMessage(response.id, message),
    ),
  };
}

export function createHttpConversationDataSource({
  endpoint,
  fetch: fetchImplementation = globalThis.fetch,
}: HttpConversationDataSourceOptions): ConversationDataSource {
  const baseEndpoint = normalizeEndpoint(endpoint);

  return {
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
