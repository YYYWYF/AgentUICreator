import { z } from 'zod';

import {
  conversationDetailResponseSchema,
  conversationListResponseSchema,
  langGraphStateSnapshotSchema,
  type ConversationDetail,
  type ConversationDetailResponse,
  type ConversationSummary,
} from '@za38.03/agent-ui-plugins/conversation-service';
import type { ConversationDataSource } from '@za38.03/agent-ui-plugins/conversation-service';

export type HttpConversationRequestBody = Record<string, unknown> | readonly unknown[] | string | number | boolean | null;

export type HttpConversationRequestContext<TInput extends object = Record<never, never>> = TInput & {
  /** Normalized base address; explicit URLs are passed to fetch without prefixing it. */
  endpoint: string;
  signal?: AbortSignal | undefined;
};

export interface HttpConversationRequestOptions<TInput extends object = Record<never, never>, TResult = unknown> {
  url?: string | ((context: HttpConversationRequestContext<TInput>) => string) | undefined;
  method?: string | undefined;
  /** JSON data, or a builder. A builder returning undefined sends no body. */
  body?: HttpConversationRequestBody | ((context: HttpConversationRequestContext<TInput>) =>
    HttpConversationRequestBody | undefined | Promise<HttpConversationRequestBody | undefined>) | undefined;
  /** Receives parsed JSON, or undefined for an empty mutation response. */
  decode?: ((value: unknown, context: HttpConversationRequestContext<TInput>) => TResult | Promise<TResult>) | undefined;
}

export interface HttpConversationDataSourceOptions {
  endpoint: string;
  fetch?: typeof globalThis.fetch | undefined;
  /** Read rotating user credentials on every request. */
  headers?: HeadersInit | (() => HeadersInit) | undefined;
  credentials?: RequestCredentials | undefined;
  list?: HttpConversationRequestOptions<Record<never, never>, ConversationSummary[]> | undefined;
  get?: HttpConversationRequestOptions<{ id: string }, ConversationDetailResponse> | undefined;
  delete?: HttpConversationRequestOptions<{ id: string }> | undefined;
  rename?: HttpConversationRequestOptions<{ id: string; title: string }> | undefined;
  archive?: HttpConversationRequestOptions<{ id: string }> | undefined;
  unarchive?: HttpConversationRequestOptions<{ id: string }> | undefined;
}

function normalizeEndpoint(endpoint: string): string {
  const normalized = endpoint.trim().replace(/\/+$/, '');
  if (normalized.length === 0) {
    throw new Error('Conversation API endpoint must not be blank.');
  }
  return normalized;
}

async function assertResponseOk(response: Response): Promise<void> {
  if (!response.ok) {
    let detail = '';
    try {
      const body: unknown = await response.json();
      if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') {
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
  conversations: z.array(
    z.object({
      thread_id: z.string(),
      title: z.string(),
      status: z.enum(['regular', 'archived']).optional(),
      last_message_time: z.string().nullish(),
    }),
  ),
});

const conversationApiDetailBodySchema = z.object({
  thread_id: z.string().trim().min(1),
  title: z.string().trim().min(1).optional(),
  max_message_checkpoint: z
    .object({
      values: z.unknown().optional(),
      channel_values: z.unknown().optional(),
    })
    .catchall(z.unknown()),
  agentState: z.unknown().optional(),
});

function readConversationApiBody(value: unknown): unknown {
  const envelope = conversationApiEnvelopeSchema.parse(value);
  if (envelope.returnCode !== 'SUC0000') {
    const detail = envelope.errorMsg ? `: ${envelope.errorMsg}` : '';
    throw new Error(`Conversation API request failed (${envelope.returnCode})${detail}`);
  }
  return envelope.body;
}

function normalizeConversationListResponse(value: unknown): ConversationSummary[] {
  if (typeof value !== 'object' || value === null || !('returnCode' in value)) {
    return conversationListResponseSchema.parse(value).conversations;
  }
  const body = conversationApiListBodySchema.parse(readConversationApiBody(value));
  return conversationListResponseSchema.parse({
    conversations: body.conversations.map((item) => {
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
  if (typeof value !== 'object' || value === null || !('returnCode' in value)) {
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

function toConversationDetail(response: ConversationDetailResponse): ConversationDetail {
  return {
    id: response.id,
    title: response.title,
    history: {
      format: 'langchain',
      messages: response.state.values.messages ?? [],
    },
    ...(response.agentState === undefined ? {} : { agentState: response.agentState }),
  };
}

export function createHttpConversationDataSource({
  endpoint,
  fetch: fetchImplementation = globalThis.fetch,
  headers: configuredHeaders,
  credentials = 'same-origin',
  list,
  get,
  delete: deleteRequest,
  rename,
  archive,
  unarchive,
}: HttpConversationDataSourceOptions): ConversationDataSource {
  const baseEndpoint = normalizeEndpoint(endpoint);
  const detailUrl = (id: string) => `${baseEndpoint}/conversations/${encodeURIComponent(id)}`;

  // Default protocol implementation belongs to this Plugin, including source takeover.
  async function request<TInput extends object>(
    operation: HttpConversationRequestOptions<TInput> | undefined,
    context: HttpConversationRequestContext<TInput>,
    defaults: { url: string; method: string; body?: HttpConversationRequestBody },
  ): Promise<Response> {
    const url = typeof operation?.url === 'function' ? operation.url(context) : operation?.url ?? defaults.url;
    const configuredBody = operation?.body;
    const body = typeof configuredBody === 'function' ? await configuredBody(context)
      : configuredBody === undefined ? defaults.body : configuredBody;
    const headers = new Headers(typeof configuredHeaders === 'function' ? configuredHeaders() : configuredHeaders);
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    return fetchImplementation(url, {
      method: operation?.method ?? defaults.method,
      headers,
      credentials,
      ...(context.signal === undefined ? {} : { signal: context.signal }),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  async function mutate<TInput extends object>(
    operation: HttpConversationRequestOptions<TInput> | undefined,
    context: HttpConversationRequestContext<TInput>,
    defaults: { url: string; method: string; body?: HttpConversationRequestBody },
  ): Promise<void> {
    const response = await request(operation, context, defaults);
    await assertResponseOk(response);
    if (operation?.decode) {
      const text = await response.text();
      await operation.decode(text.trim() ? JSON.parse(text) : undefined, context);
    }
  }

  return {
    async rename(id, title, options) {
      await mutate(rename, { endpoint: baseEndpoint, id, title, signal: options?.signal },
        { url: detailUrl(id), method: 'PATCH', body: { title } });
    },
    async archive(id, options) {
      await mutate(archive, { endpoint: baseEndpoint, id, signal: options?.signal },
        { url: `${detailUrl(id)}/archive`, method: 'POST' });
    },
    async unarchive(id, options) {
      await mutate(unarchive, { endpoint: baseEndpoint, id, signal: options?.signal },
        { url: `${detailUrl(id)}/unarchive`, method: 'POST' });
    },
    async delete(id, options) {
      await mutate(deleteRequest, { endpoint: baseEndpoint, id, signal: options?.signal },
        { url: detailUrl(id), method: 'DELETE' });
    },
    async list(options) {
      const context = { endpoint: baseEndpoint, signal: options?.signal };
      const response = await request(list, context, { url: `${baseEndpoint}/conversations`, method: 'GET' });
      const decode = list?.decode ?? normalizeConversationListResponse;
      return conversationListResponseSchema.parse({ conversations: await decode(await readResponseJson(response), context) }).conversations;
    },
    async get(threadId, options) {
      const context = { endpoint: baseEndpoint, id: threadId, signal: options?.signal };
      const response = await request(get, context, { url: detailUrl(threadId), method: 'GET' });
      const decode = get?.decode ?? normalizeConversationDetailResponse;
      return toConversationDetail(conversationDetailResponseSchema.parse(await decode(await readResponseJson(response), context)));
    },
  };
}
