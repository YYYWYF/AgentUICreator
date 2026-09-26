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

  it("maps a validated StateSnapshot envelope to LangChain history", async () => {
    const source = createHttpConversationDataSource({
      endpoint: "/api",
      fetch: async () => new Response(JSON.stringify({
        id: "conversation-1",
        title: "Conversation 1",
        state: {
          values: {
            messages: [{ id: "message-1", type: "ai", content: "Hello" }],
            businessState: { keep: true },
          },
        },
        agentState: { job: { status: "completed" } },
      }), { status: 200 }),
    });

    await expect(source.get("conversation-1")).resolves.toEqual({
      id: "conversation-1",
      title: "Conversation 1",
      history: {
        format: "langchain",
        messages: [{ id: "message-1", type: "ai", content: "Hello" }],
      },
      agentState: { job: { status: "completed" } },
    });
  });

  it("allows an empty message collection and unknown future state fields", async () => {
    const source = createHttpConversationDataSource({
      endpoint: "/api",
      fetch: async () => new Response(JSON.stringify({
        id: "conversation-1",
        title: "Conversation 1",
        state: {
          values: { arbitraryFutureField: { enabled: true } },
          futureSnapshotField: "preserved by the envelope parser",
        },
      }), { status: 200 }),
    });

    await expect(source.get("conversation-1")).resolves.toMatchObject({
      id: "conversation-1",
      history: { format: "langchain", messages: [] },
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
        state: { values: { messages: "invalid" } },
      })),
    });
    await expect(listSource.list()).rejects.toThrow();
    await expect(detailSource.get("conversation-1")).rejects.toThrow();
  });

  it("rejects a missing StateSnapshot envelope", async () => {
    const source = createHttpConversationDataSource({
      endpoint: "/api",
      fetch: async () => new Response(JSON.stringify({
        id: "conversation-1",
        title: "Conversation 1",
        messages: [],
      }), { status: 200 }),
    });

    await expect(source.get("conversation-1")).rejects.toThrow();
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


describe("HTTP conversation DELETE", () => {
  it.each([200, 202, 204])("accepts %s without reading JSON and encodes the id", async status => {
    const response = new Response(null, { status });
    const json = vi.spyOn(response, "json");
    const fetch = vi.fn(async () => response);
    const signal = new AbortController().signal;
    const source = createHttpConversationDataSource({ endpoint: "/api/", fetch });
    await expect(source.delete("id /?#", { signal })).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/conversations/id%20%2F%3F%23", { method: "DELETE", signal });
    expect(json).not.toHaveBeenCalled();
  });

  it("surfaces HTTP delete errors", async () => {
    const source = createHttpConversationDataSource({ endpoint: "/api", fetch: async () =>
      new Response(JSON.stringify({ error: "delete failed" }), { status: 500 }) });
    await expect(source.delete("A")).rejects.toThrow("Conversation API request failed (500): delete failed");
  });
});
