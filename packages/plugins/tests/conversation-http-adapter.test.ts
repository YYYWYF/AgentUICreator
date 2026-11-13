import { describe, expect, it, vi } from "vitest";
import { createHttpConversationDataSource as npmFactory } from "../dist/conversation-data-source/index.js";
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
      routes: {
        listUrl: base => `${base}/threads`,
        detailUrl: (base, id) => `${base}/threads/${encodeURIComponent(id)}`,
      },
      decodeList: async value => {
        expect(value).toEqual({ custom: true });
        return [{ id: "thread/id", title: "Custom", status: "archived" }];
      },
      decodeDetail: value => {
        expect(value).toEqual({ custom: true });
        return { id: "thread/id", title: "Custom", state: { values: { messages: [] } } };
      },
    });
    expect(await source.list({ signal })).toEqual([{ id: "thread/id", title: "Custom", status: "archived" }]);
    token = "second";
    expect(await source.get("thread/id", { signal })).toMatchObject({ id: "thread/id" });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(["https://business.test/api/threads", "https://business.test/api/threads/thread%2Fid"]);
    expect(fetch.mock.calls.map(([, init]) => new Headers(init?.headers).get("authorization"))).toEqual(["Bearer first", "Bearer second"]);
    expect(fetch.mock.calls.every(([, init]) => init?.signal === signal && init.credentials === "include")).toBe(true);
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
