import type {
  ConversationDataSource,
  ConversationSummary,
} from '@za38.03/agent-ui-plugins/conversation-service';

// Project-owned connection settings. Read rotating user credentials per request.
export const conversationConnection: {
  endpoint?: string;
  credentials: RequestCredentials;
  headers: () => HeadersInit;
} = {
  credentials: 'same-origin',
  headers: () => ({}),
};

export interface ConversationDataSourceDependencies {
  endpoint: string;
  fetch?: typeof globalThis.fetch;
}

async function assertResponseOk(response: Response): Promise<void> {
  if (!response.ok) throw new Error(`CONVERSATION_HTTP_ERROR_${response.status}`);
}

// The backend contract stays separate from the conversation-service contract.
// Keep business response validation and mapping in this project-owned file.
function readObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('CONVERSATION_OBJECT_REQUIRED');
  }
  return value as Record<string, unknown>;
}

function readArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error('CONVERSATION_ARRAY_REQUIRED');
  return value as readonly unknown[];
}

function readNonBlankString(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('CONVERSATION_STRING_REQUIRED');
  }
  return value;
}

function readOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new Error('CONVERSATION_STRING_REQUIRED');
  return value;
}

function readConversationBody(value: unknown): unknown {
  const envelope = readObject(value);
  const returnCode = readNonBlankString(envelope.returnCode);
  const errorMsg = readOptionalString(envelope.errorMsg);
  if (returnCode !== 'SUC0000') {
    const detail = errorMsg ? `: ${errorMsg}` : '';
    throw new Error(`CONVERSATION_API_ERROR_${returnCode}${detail}`);
  }
  return envelope.body;
}

// Each Agent binds its own endpoint/transport. All business requests live here;
// edit a method directly to use different URLs, response mappings, Axios or an SDK.
export function createConversationDataSource({
  endpoint,
  fetch: request = globalThis.fetch.bind(globalThis),
}: ConversationDataSourceDependencies): ConversationDataSource {
  const baseUrl = endpoint.trim().replace(/\/+$/, '');
  if (!baseUrl) throw new Error('CONVERSATION_ENDPOINT_REQUIRED');

  return {
    async list({ signal } = {}) {
      const response = await request(`${baseUrl}/conversations`, {
        method: 'GET',
        headers: conversationConnection.headers(),
        credentials: conversationConnection.credentials,
        ...(signal === undefined ? {} : { signal }),
      });
      await assertResponseOk(response);
      const value: unknown = await response.json();
      const body = readObject(readConversationBody(value));
      return readArray(body.conversations).map((value): ConversationSummary => {
        const item = readObject(value);
        const status = item.status;
        if (status !== undefined && status !== 'regular' && status !== 'archived') {
          throw new Error('CONVERSATION_STATUS_INVALID');
        }
        const updatedAt = readOptionalString(item.last_message_time)?.trim();
        return {
          id: readNonBlankString(item.thread_id),
          title: readNonBlankString(item.title),
          ...(status === undefined ? {} : { status }),
          ...(updatedAt ? { updatedAt } : {}),
        };
      });
    },
    async get(id, { signal } = {}) {
      const response = await request(`${baseUrl}/conversations/${encodeURIComponent(id)}`, {
        method: 'GET',
        headers: conversationConnection.headers(),
        credentials: conversationConnection.credentials,
        ...(signal === undefined ? {} : { signal }),
      });
      await assertResponseOk(response);
      const value: unknown = await response.json();
      const body = readObject(readConversationBody(value));
      const threadId = readNonBlankString(body.thread_id).trim();
      if (threadId !== id) throw new Error('CONVERSATION_ID_MISMATCH');
      const title = body.title === undefined ? threadId : readNonBlankString(body.title).trim();
      const checkpoint = readObject(body.max_message_checkpoint);
      if (checkpoint.createdAt !== undefined && typeof checkpoint.createdAt !== 'string') {
        throw new Error('CONVERSATION_CHECKPOINT_INVALID');
      }
      if (checkpoint.tasks !== undefined) readArray(checkpoint.tasks);
      const values = readObject(
        checkpoint.values === undefined ? checkpoint.channel_values : checkpoint.values,
      );
      return {
        id: threadId,
        title,
        history: {
          format: 'langchain',
          messages: values.messages === undefined ? [] : readArray(values.messages),
        },
        ...(body.agentState === undefined ? {} : { agentState: body.agentState }),
      };
    },
    async delete(id, { signal } = {}) {
      const response = await request(`${baseUrl}/conversations/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: conversationConnection.headers(),
        credentials: conversationConnection.credentials,
        ...(signal === undefined ? {} : { signal }),
      });
      await assertResponseOk(response);
    },
    async rename(id, title, { signal } = {}) {
      const headers = new Headers(conversationConnection.headers());
      headers.set('Content-Type', 'application/json');
      const response = await request(`${baseUrl}/conversations/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers,
        credentials: conversationConnection.credentials,
        ...(signal === undefined ? {} : { signal }),
        body: JSON.stringify({ title }),
      });
      await assertResponseOk(response);
    },
    async archive(id, { signal } = {}) {
      const response = await request(`${baseUrl}/conversations/${encodeURIComponent(id)}/archive`, {
        method: 'POST',
        headers: conversationConnection.headers(),
        credentials: conversationConnection.credentials,
        ...(signal === undefined ? {} : { signal }),
      });
      await assertResponseOk(response);
    },
    async unarchive(id, { signal } = {}) {
      const response = await request(`${baseUrl}/conversations/${encodeURIComponent(id)}/unarchive`, {
        method: 'POST',
        headers: conversationConnection.headers(),
        credentials: conversationConnection.credentials,
        ...(signal === undefined ? {} : { signal }),
      });
      await assertResponseOk(response);
    },
  };
}
