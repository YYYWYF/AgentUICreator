import { describe, expect, it, vi } from "vitest";

import { createHttpConversationDataSource } from "../services/conversations";

describe("HttpConversationDataSource", () => {
  it("loads and validates the full conversation list", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      conversations: [{ id: "conversation-1", title: "Conversation 1" }],
    }), { status: 200 }));
    const source = createHttpConversationDataSource({
      endpoint: "/api/",
      fetch,
    });

    await expect(source.list()).resolves.toEqual([
      { id: "conversation-1", title: "Conversation 1" },
    ]);
    expect(fetch).toHaveBeenCalledWith("/api/conversations", expect.objectContaining({
      method: "GET",
    }));
  });

  it("maps validated detail DTOs to frontend AgentMessage values", async () => {
    const source = createHttpConversationDataSource({
      endpoint: "/api",
      fetch: async () => new Response(JSON.stringify({
        id: "conversation-1",
        title: "Conversation 1",
        messages: [{
          id: "message-1",
          role: "assistant",
          content: "Hello",
          metadata: { source: "fixture" },
        }],
      }), { status: 200 }),
    });

    await expect(source.get("conversation-1")).resolves.toEqual({
      id: "conversation-1",
      title: "Conversation 1",
      messages: [{
        id: "message-1",
        producer: { type: "root" },
        role: "assistant",
        content: "Hello",
        metadata: {
          source: "fixture",
          conversationId: "conversation-1",
        },
      }],
    });
  });

  it("surfaces a detail 404", async () => {
    const source = createHttpConversationDataSource({
      endpoint: "/api",
      fetch: async () => new Response(JSON.stringify({
        error: "Conversation not found: missing",
      }), { status: 404 }),
    });
    await expect(source.get("missing")).rejects.toThrow(
      "Conversation API request failed (404): Conversation not found: missing",
    );
  });

  it("rejects invalid list and detail response shapes", async () => {
    const listSource = createHttpConversationDataSource({
      endpoint: "/api",
      fetch: async () => new Response(JSON.stringify({ conversations: [{}] })),
    });
    const detailSource = createHttpConversationDataSource({
      endpoint: "/api",
      fetch: async () => new Response(JSON.stringify({
        id: "conversation-1",
        title: "Conversation 1",
        messages: [{ id: "message-1", role: "tool", content: "invalid" }],
      })),
    });
    await expect(listSource.list()).rejects.toThrow();
    await expect(detailSource.get("conversation-1")).rejects.toThrow();
  });

  it("passes AbortSignal through to fetch", async () => {
    const fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
      }));
    const source = createHttpConversationDataSource({ endpoint: "/api", fetch });
    const controller = new AbortController();
    const request = source.list({ signal: controller.signal });
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });
});
