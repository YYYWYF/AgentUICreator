import { z } from "zod";

import {
  conversationDetailResponseSchema,
  conversationListResponseSchema,
  langGraphStateSnapshotSchema,
  type ConversationDetail,
  type ConversationDetailResponse,
  type ConversationSummary,
} from "@za38.03/agent-ui-runtime/ui/services/conversations/contract";
import type { ConversationDataSource } from "@za38.03/agent-ui-runtime/ui/services/conversations/data-source";

export interface HttpConversationDataSourceOptions {
  endpoint: string;
  fetch?: typeof globalThis.fetch | undefined;
}

// Project-owned request implementation. Creator adapts these routes and reads
// current user credentials here when connecting a business history service.
const conversationRequests = {
  listUrl: (base: string) => `${base}/conversations`,
  detailUrl: (base: string, id: string) => `${base}/conversation/${encodeURIComponent(id)}`,
  deleteUrl: (base: string, id: string) => `${base}/conversations/${encodeURIComponent(id)}`,
  renameUrl: (base: string, id: string) => `${base}/conversations/${encodeURIComponent(id)}`,
  archiveUrl: (base: string, id: string) => `${base}/conversations/${encodeURIComponent(id)}/archive`,
  unarchiveUrl: (base: string, id: string) => `${base}/conversations/${encodeURIComponent(id)}/unarchive`,
  headers: (): HeadersInit => ({}),
  credentials: "same-origin" as RequestCredentials,
};

function requestInit(method: string, signal?: AbortSignal): RequestInit {
  return {
    method,
    headers: conversationRequests.headers(),
    credentials: conversationRequests.credentials,
    ...(signal === undefined ? {} : { signal }),
  };
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

const conversationApiEnvelopeSchema = z.object({
  returnCode: z.string(),
  errorMsg: z.string().nullish(),
  body: z.unknown().optional(),
});

const conversationApiListBodySchema = z.object({
  conversations: z.array(z.object({
    thread_id: z.string(),
    title: z.string(),
    status: z.enum(["regular", "archived"]).optional(),
    last_message_time: z.string().nullish(),
  })),
});

const conversationApiDetailBodySchema = z.object({
  thread_id: z.string().trim().min(1),
  title: z.string().trim().min(1).optional(),
  max_message_checkpoint: z.object({
    values: z.unknown().optional(),
    channel_values: z.unknown().optional(),
  }).catchall(z.unknown()),
  agentState: z.unknown().optional(),
});

function readConversationApiBody(value: unknown): unknown {
  const envelope = conversationApiEnvelopeSchema.parse(value);
  if (envelope.returnCode !== "SUC0000") {
    const detail = envelope.errorMsg ? `: ${envelope.errorMsg}` : "";
    throw new Error(`Conversation API request failed (${envelope.returnCode})${detail}`);
  }
  return envelope.body;
}

function normalizeConversationListResponse(value: unknown): ConversationSummary[] {
  if (typeof value !== "object" || value === null || !("returnCode" in value)) {
    return conversationListResponseSchema.parse(value).conversations;
  }
  const body = conversationApiListBodySchema.parse(readConversationApiBody(value));
  return conversationListResponseSchema.parse({
    conversations: body.conversations.map(item => {
      const updatedAt = item.last_message_time?.trim();
      return {
        id: item.thread_id,
        title: item.title,
        ...(item.status === undefined ? {} : { status: item.status }),
        ...(updatedAt ? { updatedAt } : {}),
      };
    }),
  }).conversations;
}

function normalizeConversationDetailResponse(value: unknown): ConversationDetailResponse {
  // Existing Mock providers and generated projects may still return the direct DTO.
  if (typeof value !== "object" || value === null || !("returnCode" in value)) {
    return conversationDetailResponseSchema.parse(value);
  }
  const body = conversationApiDetailBodySchema.parse(readConversationApiBody(value));
  const checkpoint = body.max_message_checkpoint;
  // Normalize the storage field name at the HTTP boundary. The current snapshot
  // schema and LangChain message conversion remain authoritative.
  const state = langGraphStateSnapshotSchema.parse({
    ...checkpoint,
    values: checkpoint.values === undefined ? checkpoint.channel_values : checkpoint.values,
  });
  return {
    id: body.thread_id,
    title: body.title ?? body.thread_id,
    state,
    ...(body.agentState === undefined ? {} : { agentState: body.agentState }),
  };
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
    async rename(id, title, options) {
      const init = requestInit("PATCH", options?.signal);
      const headers = new Headers(init.headers);
      headers.set("Content-Type", "application/json");
      const response = await fetchImplementation(conversationRequests.renameUrl(baseEndpoint, id), {
        ...init, headers, body: JSON.stringify({ title }),
      });
      await assertResponseOk(response);
    },
    async archive(id, options) {
      const response = await fetchImplementation(conversationRequests.archiveUrl(baseEndpoint, id), requestInit("POST", options?.signal));
      await assertResponseOk(response);
    },
    async unarchive(id, options) {
      const response = await fetchImplementation(conversationRequests.unarchiveUrl(baseEndpoint, id), requestInit("POST", options?.signal));
      await assertResponseOk(response);
    },
    async delete(id, options) {
      const response = await fetchImplementation(
        conversationRequests.deleteUrl(baseEndpoint, id),
        requestInit("DELETE", options?.signal),
      );
      await assertResponseOk(response);
    },
    async list(options) {
      const response = await fetchImplementation(conversationRequests.listUrl(baseEndpoint), requestInit("GET", options?.signal));
      return normalizeConversationListResponse(
        await readResponseJson(response),
      );
    },
    async get(threadId, options) {
      const response = await fetchImplementation(
        conversationRequests.detailUrl(baseEndpoint, threadId),
        requestInit("GET", options?.signal),
      );
      return toConversationDetail(
        normalizeConversationDetailResponse(
          await readResponseJson(response),
        ),
      );
    },
  };
}
