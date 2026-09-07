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
        expect.objectContaining({ id: "conversation-agent-ui" }),
      ]),
    });
  });

  it("returns a known conversation detail", async () => {
    const response = await fetch(
      `${origin}/__agent-ui/mock-data/conversations/conversation-tool`,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: "conversation-tool",
      messages: expect.arrayContaining([
        expect.objectContaining({ role: "assistant" }),
      ]),
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
