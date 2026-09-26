import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMockConversationApiHandler } from "../dev-mock/conversations/handler";

describe("Mock Conversation API", () => {
  let server: Server;
  let origin: string;

  beforeAll(async () => {
    const handler = createMockConversationApiHandler({
      listDelayMs: 0,
      detailDelayMs: 0,
    });
    server = createServer((request, response) => {
      void handler(request, response).then((handled) => {
        if (!handled) {
          response.statusCode = 404;
          response.end();
        }
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address() as AddressInfo;
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error === undefined ? resolve() : reject(error));
    });
  });

  it("returns the conversation list", async () => {
    const response = await fetch(`${origin}/__agent-ui/mock-data/conversations`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      conversations: expect.arrayContaining([
        expect.objectContaining({ id: "mock-history-basic" }),
        expect.objectContaining({
          id: "mock-history-tool",
          title: "历史：已完成工具调用",
        }),
        expect.objectContaining({ id: "mock-history-long" }),
      ]),
    });
  });

  it("returns a known conversation detail", async () => {
    const response = await fetch(
      `${origin}/__agent-ui/mock-data/conversations/mock-history-basic`,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: "mock-history-basic",
      state: {
        values: {
          messages: expect.arrayContaining([
            expect.objectContaining({ type: "ai" }),
          ]),
        },
      },
    });
  });

  it("returns completed tool history in the LangGraph snapshot", async () => {
    const response = await fetch(
      `${origin}/__agent-ui/mock-data/conversations/mock-history-tool`,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      state: {
        values: { messages: [
          expect.objectContaining({
            type: "human",
          }),
          expect.objectContaining({
            type: "ai",
            tool_calls: expect.any(Array),
          }),
          expect.objectContaining({ type: "tool", status: "success" }),
          expect.objectContaining({ type: "ai" }),
        ] },
      },
    });
  });

  it("returns 404 for an unknown conversation", async () => {
    const response = await fetch(
      `${origin}/__agent-ui/mock-data/conversations/not-found`,
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Conversation not found: not-found",
    });
  });
});


describe("Mock conversation deletion", () => {
  it("removes list and detail, repeats idempotently, and resets per handler", async () => {
    const serve = async () => {
      const handler = createMockConversationApiHandler({ listDelayMs: 0, detailDelayMs: 0 });
      const server = createServer((request, response) => { void handler(request, response); });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/__agent-ui/mock-data/conversations` };
    };
    const first = await serve();
    const second = await serve();
    try {
      const list = () => fetch(first.url).then(response => response.json());
      expect((await list()).conversations.some((item: { id: string }) => item.id === "mock-history-basic")).toBe(true);
      const target = `${first.url}/mock-history-basic`;
      const removed = await fetch(target, { method: "DELETE" });
      expect(removed.status).toBe(204);
      expect(await removed.text()).toBe("");
      expect((await list()).conversations.some((item: { id: string }) => item.id === "mock-history-basic")).toBe(false);
      expect((await fetch(target)).status).toBe(404);
      expect((await fetch(target, { method: "DELETE" })).status).toBe(204);
      expect((await fetch(`${first.url}/unknown`, { method: "DELETE" })).status).toBe(404);
      expect((await fetch(`${second.url}/mock-history-basic`)).status).toBe(200);
      for (const [url, method, allow] of [
        [first.url, "DELETE", "GET"], [target, "POST", "GET, DELETE"],
        [target, "PUT", "GET, DELETE"], [target, "PATCH", "GET, DELETE"],
      ]) {
        const response = await fetch(url!, { method: method! });
        expect(response.status).toBe(405);
        expect(response.headers.get("Allow")).toBe(allow);
      }
    } finally {
      await Promise.all([first.server, second.server].map(server => new Promise<void>((resolve, reject) =>
        server.close(error => error === undefined ? resolve() : reject(error)))));
    }
  });
});
