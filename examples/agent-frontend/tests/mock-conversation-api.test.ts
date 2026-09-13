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
        expect.objectContaining({ id: "conversation-replay-agent-elements" }),
        expect.objectContaining({ id: "conversation-replay-tool-error" }),
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

  it("returns rich replay data without rerunning an Agent scenario", async () => {
    const response = await fetch(
      `${origin}/__agent-ui/mock-data/conversations/conversation-replay-agent-elements`,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      replay: {
        version: 1,
        messages: [
          expect.objectContaining({
            id: "replay-agent-elements-user",
            role: "user",
          }),
          expect.objectContaining({
            id: "replay-agent-elements-assistant",
            role: "assistant",
            status: { type: "complete", reason: "stop" },
          }),
        ],
      },
    });
  });

  it("returns sources, attachments, and terminal tool errors from fixtures", async () => {
    const sourcesResponse = await fetch(
      `${origin}/__agent-ui/mock-data/conversations/conversation-replay-sources-attachments`,
    );
    await expect(sourcesResponse.json()).resolves.toMatchObject({
      replay: {
        messages: [
          expect.objectContaining({ attachments: expect.any(Array) }),
          expect.objectContaining({
            parts: expect.arrayContaining([
              expect.objectContaining({ sourceType: "url" }),
              expect.objectContaining({ sourceType: "document" }),
            ]),
          }),
        ],
      },
    });

    const errorResponse = await fetch(
      `${origin}/__agent-ui/mock-data/conversations/conversation-replay-tool-error`,
    );
    await expect(errorResponse.json()).resolves.toMatchObject({
      replay: {
        messages: [expect.objectContaining({
          status: { type: "incomplete", reason: "error" },
          parts: [expect.objectContaining({ isError: true })],
        })],
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
