import { describe, expect, it, vi } from "vitest";
import { createHttpConversationDataSource as npmFactory, type HttpConversationDataSourceOptions } from "../dist/conversation-data-source/index.js";
import { createHttpConversationDataSource as sourceFactory } from "../dist/sources/takeover/conversation-data-source/index";
import { projectConversationDetail as npmProjector } from "../dist/conversation-service/index.js";
import { projectConversationDetail as sourceProjector } from "../dist/sources/takeover/conversation-service/index";

describe.each([
  { mode: "npm", create: npmFactory, project: npmProjector },
  { mode: "owned source", create: sourceFactory, project: sourceProjector },
])("$mode conversation protocol adapter", ({ create, project }) => {
  it.each(["values", "channel_values"])("loads %s checkpoints through message compatibility and official conversion", async field => {
    const agentState = { selected: "explicit application state" };
    const checkpoint = {
      [field]: { messages: [
        { id: "user", type: "human", content: "<think>User literal</think>" },
        { id: "answer", type: "ai", content: "<think>Saved reasoning</think>Answer" },
        { id: "empty", type: "ai", content: "<think>" },
      ], privateBackendState: "never application state" },
    };
    const source = create({ endpoint: "/history", fetch: async () => Response.json({
      returnCode: "SUC0000", body: { thread_id: "thread", title: "Saved", max_message_checkpoint: checkpoint, agentState },
    }) });
    const detail = await source.get("thread");
    expect(detail).toMatchObject({ id: "thread", title: "Saved", agentState });
    expect(project(detail)).toMatchObject([
      { id: "user", role: "user", content: [{ type: "text", text: "<think>User literal</think>" }] },
      { id: "answer", role: "assistant", content: [{ type: "reasoning", text: "Saved reasoning" }, { type: "text", text: "Answer" }] },
    ]);
    expect(detail.history.messages).toHaveLength(3);
  });

  it("prefers values, preserves direct DTOs and never infers AG-UI state", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ returnCode: "SUC0000", body: {
        thread_id: "wrapped", max_message_checkpoint: {
          values: { messages: [{ type: "human", content: "Current" }], private: true },
          channel_values: { messages: [{ type: "human", content: "Stale" }] },
        },
      } }))
      .mockResolvedValueOnce(Response.json({ id: "direct", title: "Direct", state: { values: { messages: [], private: true } } }));
    const source = create({ endpoint: "/history", fetch });
    const wrapped = await source.get("wrapped"), direct = await source.get("direct");
    expect(wrapped.history.messages).toEqual([{ type: "human", content: "Current" }]);
    expect(wrapped.title).toBe("wrapped");
    expect(direct).toEqual({ id: "direct", title: "Direct", history: { format: "langchain", messages: [] } });
    expect(wrapped).not.toHaveProperty("agentState");
  });

  it("retains project routes, rotating authentication, credentials, cancellation and response hooks", async () => {
    let token = "first";
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ custom: true }));
    const signal = new AbortController().signal;
    const source = create({
      endpoint: "https://business.test/api/", fetch, credentials: "include",
      headers: () => ({ Authorization: `Bearer ${token}` }),
      list: {
        url: ({ endpoint }) => `${endpoint}/threads`,
        decode: async value => {
          expect(value).toEqual({ custom: true });
          return [{ id: "thread/id", title: "Custom", status: "archived" }];
        },
      },
      get: {
        url: ({ endpoint, id }) => `${endpoint}/threads/${encodeURIComponent(id)}`,
        decode: value => {
          expect(value).toEqual({ custom: true });
          return { id: "thread/id", title: "Custom", state: { values: { messages: [] } } };
        },
      },
    });
    expect(await source.list({ signal })).toEqual([{ id: "thread/id", title: "Custom", status: "archived" }]);
    token = "second";
    expect(await source.get("thread/id", { signal })).toMatchObject({ id: "thread/id" });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(["https://business.test/api/threads", "https://business.test/api/threads/thread%2Fid"]);
    expect(fetch.mock.calls.map(([, init]) => new Headers(init?.headers).get("authorization"))).toEqual(["Bearer first", "Bearer second"]);
    expect(fetch.mock.calls.every(([, init]) => init?.signal === signal && init.credentials === "include")).toBe(true);
  });

  it.each<{ name: string; operations: Partial<HttpConversationDataSourceOptions>; expected: string[] }>([
    { name: "default", operations: {}, expected: ["GET", "GET", "DELETE", "PATCH", "POST", "POST"] },
    { name: "partial", operations: { delete: { method: "POST" } }, expected: ["GET", "GET", "POST", "PATCH", "POST", "POST"] },
    { name: "per-operation", operations: { list: { method: "POST" }, get: { method: "POST" }, delete: { method: "POST" },
      rename: { method: "PUT" }, archive: { method: "PATCH" }, unarchive: { method: "DELETE" } },
      expected: ["POST", "POST", "POST", "PUT", "PATCH", "DELETE"] },
  ])("uses $name HTTP methods while preserving routes, bodies, authentication and cancellation", async ({ operations, expected }) => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ conversations: [{ id: "中文/id", title: "Saved" }] }))
      .mockResolvedValueOnce(Response.json({ id: "中文/id", title: "Saved", state: { values: { messages: [] } } }))
      .mockImplementation(async () => new Response(null, { status: 204 }));
    const signal = new AbortController().signal;
    const source = create({ ...operations, endpoint: "https://business.test/api/", fetch,
      headers: { Authorization: "Bearer current" }, credentials: "include",
      delete: { url: ({ endpoint, id }) => `${endpoint}/history/${encodeURIComponent(id)}`, ...operations.delete },
    });

    expect(await source.list({ signal })).toEqual([{ id: "中文/id", title: "Saved" }]);
    expect(await source.get("中文/id", { signal })).toMatchObject({ id: "中文/id", history: { format: "langchain", messages: [] } });
    await source.delete("中文/id", { signal });
    await source.rename!("中文/id", "Renamed", { signal });
    await source.archive!("中文/id", { signal });
    await source.unarchive!("中文/id", { signal });

    expect(fetch.mock.calls.map(([, init]) => init?.method)).toEqual(expected);
    const url = "https://business.test/api/conversations/%E4%B8%AD%E6%96%87%2Fid";
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "https://business.test/api/conversations", url, "https://business.test/api/history/%E4%B8%AD%E6%96%87%2Fid",
      url, `${url}/archive`, `${url}/unarchive`,
    ]);
    expect(fetch.mock.calls.map(([, init]) => init?.body)).toEqual([
      undefined, undefined, undefined, JSON.stringify({ title: "Renamed" }), undefined, undefined,
    ]);
    expect(new Headers(fetch.mock.calls[3]?.[1]?.headers).get("content-type")).toBe("application/json");
    expect(fetch.mock.calls.every(([, init]) => init?.signal === signal && init.credentials === "include"
      && new Headers(init.headers).get("authorization") === "Bearer current")).toBe(true);
  });

  it("configures every business endpoint with its own URL, method, JSON body and response decoder", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ items: [{ sessionId: "中文/id", name: "Saved" }] }))
      .mockResolvedValueOnce(Response.json({ name: "Saved", records: [{ id: "user", type: "human", content: "Hello" }] }))
      .mockImplementation(async () => Response.json({ code: 0 }));
    const decodeMutation = vi.fn((value: unknown) => {
      expect(value).toEqual({ code: 0 });
    });
    const signal = new AbortController().signal;
    const source = create({ endpoint: "/unused-base", fetch,
      list: { url: "/business/list", method: "POST", body: { archived: false }, decode(value) {
        expect(value).toEqual({ items: [{ sessionId: "中文/id", name: "Saved" }] });
        return [{ id: "中文/id", title: "Saved" }];
      } },
      get: { url: "https://other-business.test/detail", method: "POST", async body({ id, endpoint, signal: requestSignal }) {
        expect(endpoint).toBe("/unused-base");
        expect(requestSignal).toBe(signal);
        return { sessionId: id };
      }, async decode(value, { id }) {
        expect(value).toEqual({ name: "Saved", records: [{ id: "user", type: "human", content: "Hello" }] });
        return { id, title: "Saved", state: { values: { messages: [{ id: "user", type: "human", content: "Hello" }] } } };
      } },
      delete: { url: "/business/remove", method: "POST", body: ({ id }) => ({ sessionId: id }), decode: decodeMutation },
      rename: { url: ({ id }) => `/business/rename?session=${encodeURIComponent(id)}`, method: "PUT",
        body: ({ id, title }) => ({ sessionId: id, name: title }), decode: decodeMutation },
      archive: { url: "/business/archive", method: "PATCH", body: ({ id }) => ({ sessionId: id, archived: true }), decode: decodeMutation },
      unarchive: { url: "/business/restore", method: "PUT", body: ({ id }) => ({ sessionId: id, archived: false }), decode: decodeMutation },
    });

    expect(await source.list({ signal })).toEqual([{ id: "中文/id", title: "Saved" }]);
    expect((await source.get("中文/id", { signal })).history.messages).toEqual([{ id: "user", type: "human", content: "Hello" }]);
    await source.delete("中文/id", { signal });
    await source.rename!("中文/id", "New title", { signal });
    await source.archive!("中文/id", { signal });
    await source.unarchive!("中文/id", { signal });
    expect(fetch.mock.calls.map(([url, init]) => [url, init?.method, JSON.parse(String(init?.body))])).toEqual([
      ["/business/list", "POST", { archived: false }],
      ["https://other-business.test/detail", "POST", { sessionId: "中文/id" }],
      ["/business/remove", "POST", { sessionId: "中文/id" }],
      ["/business/rename?session=%E4%B8%AD%E6%96%87%2Fid", "PUT", { sessionId: "中文/id", name: "New title" }],
      ["/business/archive", "PATCH", { sessionId: "中文/id", archived: true }],
      ["/business/restore", "PUT", { sessionId: "中文/id", archived: false }],
    ]);
    expect(decodeMutation).toHaveBeenCalledTimes(4);
    expect(fetch.mock.calls.every(([, init]) => init?.signal === signal
      && new Headers(init.headers).get("content-type") === "application/json")).toBe(true);
  });

  it("checks mutation business failures, handles empty responses and preserves HTTP failures", async () => {
    const decode = vi.fn((value: unknown) => {
      if (value !== undefined && (value as { code: number }).code !== 0) throw new Error("BUSINESS_FAILURE");
    });
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ code: 1 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ code: 0 }, { status: 403 }));
    const source = create({ endpoint: "/api", fetch, delete: { decode } });
    await expect(source.delete("id")).rejects.toThrow("BUSINESS_FAILURE");
    await expect(source.delete("id")).resolves.toBeUndefined();
    expect(decode).toHaveBeenLastCalledWith(undefined, expect.objectContaining({ id: "id" }));
    await expect(source.delete("id")).rejects.toThrow("403");
    expect(decode).toHaveBeenCalledTimes(2);
  });

  it("can remove the default rename body or explicitly send JSON null", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 204 }));
    const withoutBody = create({ endpoint: "/api", fetch, rename: {
      url: ({ id, title }) => `/rename?id=${encodeURIComponent(id)}&title=${encodeURIComponent(title)}`,
      method: "GET", body: () => undefined,
    } });
    await withoutBody.rename!("id", "New title");
    expect(fetch.mock.calls[0]).toEqual(["/rename?id=id&title=New%20title", expect.objectContaining({ method: "GET" })]);
    expect(fetch.mock.calls[0]?.[1]).not.toHaveProperty("body");
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).has("content-type")).toBe(false);
    const withNull = create({ endpoint: "/api", fetch, rename: { body: null } });
    await withNull.rename!("id", "New title");
    expect(fetch.mock.calls[1]?.[1]?.body).toBe("null");
  });

  it("validates custom read decoders against the shared conversation contract", async () => {
    const source = create({ endpoint: "/api", fetch: async () => Response.json({ custom: true }),
      list: { decode: () => [{ id: "", title: "Saved" }] },
      get: { decode: () => ({ id: "id", title: "", state: { values: { messages: [] } } }) },
    });
    await expect(source.list()).rejects.toThrow();
    await expect(source.get("id")).rejects.toThrow();
  });

  it("rejects failed envelopes, invalid checkpoints and failed HTTP without treating them as empty history", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ returnCode: "DENIED", errorMsg: "Session expired" }))
      .mockResolvedValueOnce(Response.json({ returnCode: "SUC0000", body: { thread_id: "broken", max_message_checkpoint: {} } }))
      .mockResolvedValueOnce(Response.json({ error: "denied" }, { status: 403 }));
    const source = create({ endpoint: "/history", fetch });
    await expect(source.list()).rejects.toThrow("DENIED");
    await expect(source.get("broken")).rejects.toThrow();
    await expect(source.delete("broken")).rejects.toThrow("403");
  });
});
