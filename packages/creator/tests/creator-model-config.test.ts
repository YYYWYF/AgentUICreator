import { expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdir, mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createModel, hostEnvironment } from "../src/agent/config.js";
import { CREATOR_HOST_ENV_FILE, readCreatorHostConfigValue } from "../src/creatorRuntimeConfig.js";
import { logicalProjectPath } from "../src/agent/project-read.js";

it("requires the Creator model configuration namespace", () => {
  expect(() => createModel({ MODEL_BASE_URL: "http://127.0.0.1:1/v1", MODEL_API_KEY: "unused" }, "config")).toThrow("CREATOR_MODEL_CONFIGURATION_MISSING");
});

it("reads only the tool config root and preserves nonempty environment overrides", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "creator 配置 root-"));
  try {
    expect(readCreatorHostConfigValue(root, "CREATOR_ENV_FIXTURE")).toBeUndefined();
    await mkdir(path.join(root, ".agent-ui", "creator"), { recursive: true });
    await writeFile(path.join(root, CREATOR_HOST_ENV_FILE), "CREATOR_ENV_FIXTURE=new-file\r\n");
    vi.stubEnv("CREATOR_ENV_FIXTURE", "process-value");
    expect(hostEnvironment(root).CREATOR_ENV_FIXTURE).toBe("process-value");
    vi.stubEnv("CREATOR_ENV_FIXTURE", " ");
    expect(hostEnvironment(root).CREATOR_ENV_FIXTURE).toBe("new-file");
    expect(readCreatorHostConfigValue(root, "CREATOR_ENV_FIXTURE")).toBe("new-file");
    expect(readCreatorHostConfigValue(path.join(root, "other-project"), "CREATOR_ENV_FIXTURE")).toBeUndefined();
    expect(() => logicalProjectPath("/.agent-ui/creator/.env.local")).toThrow("TOOL_PERMISSION_DENIED");
    expect(path.win32.join("C:\\工具 配置", CREATOR_HOST_ENV_FILE)).toBe("C:\\工具 配置\\.agent-ui\\creator\\.env.local");
  } finally {
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  }
});

it("reads standard host env syntax and uses the actual package identity over streamed model transport", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "creator-config-"));
  let received: any;
  const server = createServer(async (request, response) => {
    let input = ""; for await (const chunk of request) input += chunk;
    received = { path: request.url, body: JSON.parse(input), userAgent: request.headers["user-agent"] };
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.end('data: '+JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta: { role: "assistant", content: "fixture answer" }, finish_reason: "stop" }] })+'\n\ndata: [DONE]\n\n');
  });
  try {
    await mkdir(path.join(root, ".agent-ui", "creator"), { recursive: true });
    await writeFile(path.join(root, ".agent-ui/creator/.env.local"), 'export CREATOR_ENV_FIXTURE="quoted # value"\nCREATOR_AGENT_MODE=domain-read # comment\n');
    expect(hostEnvironment(root).CREATOR_ENV_FIXTURE).toBe("quoted # value");
    expect(readCreatorHostConfigValue(root, "CREATOR_AGENT_MODE")).toBe("domain-read");
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address(); if (!address || typeof address === "string") throw Error("missing port");
    const origin = `http://127.0.0.1:${address.port}`;
    const originalFetch = globalThis.fetch;
    const requests: string[] = [];
    // Token estimation is outside this HTTP/SSE transport contract. Keep the
    // SDK's invoke() path without downloading its tokenizer from a public CDN.
    const tokenCounter = vi.spyOn(BaseChatModel.prototype, "getNumTokens").mockResolvedValue(1);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      requests.push(url);
      // Keep this transport test local, including SDK post-processing requests.
      if (new URL(url).origin !== origin) return Promise.resolve(Response.json({}));
      return originalFetch(input, init);
    });
    try {
      const message = await createModel({ CREATOR_MODEL_BASE_URL: `${origin}/v1`, CREATOR_MODEL_API_KEY: "local-fixture", CREATOR_MODEL_NAME: "fixture", CREATOR_MODEL_TIMEOUT_SECONDS: "3" }, "fixture-thread").invoke("fixture prompt");
      expect(message.content).toBe("fixture answer");
      expect(requests).toEqual([`${origin}/v1/chat/completions`]);
    } finally { fetchSpy.mockRestore(); tokenCounter.mockRestore(); }
    expect(received.path).toBe("/v1/chat/completions"); expect(received.body.stream).toBe(true);
    const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    expect(received.userAgent).toBe(`agent-ui-creator/${manifest.version}`);
  } finally { server.closeAllConnections(); server.close(); await rm(root, { recursive: true, force: true }); }
}, 15_000);

it.each([
  { kind: "configured deadline", timeout: "1", cancelAfter: undefined, maximum: 2000 },
  { kind: "fractional configured deadline", timeout: "1.0001", cancelAfter: undefined, maximum: 2000 },
  { kind: "caller cancellation", timeout: "3", cancelAfter: 100, maximum: 1500 },
])("honors $kind after a stream sends headers and then stalls", async ({ timeout, cancelAfter, maximum }) => {
  let receivedStream = false;
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) { /* Consume the local request. */ }
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.write('data: '+JSON.stringify({ id: "stall", object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta: { role: "assistant", content: "partial" }, finish_reason: null }] })+'\n\n');
    receivedStream = true;
    const timer = setTimeout(() => response.end('data: '+JSON.stringify({ id: "stall", object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })+'\n\ndata: [DONE]\n\n'), 2500);
    response.on("close", () => clearTimeout(timer));
  });
  const tokens = vi.spyOn(BaseChatModel.prototype, "getNumTokens").mockResolvedValue(1);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const controller = new AbortController();
  const cancel = cancelAfter === undefined ? undefined : setTimeout(() => controller.abort(), cancelAfter);
  try {
    const port = (server.address() as import("node:net").AddressInfo).port;
    const started = Date.now();
    await expect(createModel({ CREATOR_MODEL_BASE_URL: `http://127.0.0.1:${port}/v1`, CREATOR_MODEL_API_KEY: "fixture", CREATOR_MODEL_NAME: "fixture", CREATOR_MODEL_TIMEOUT_SECONDS: timeout }, "stalled-stream").invoke("fixture", { signal: controller.signal })).rejects.toThrow();
    expect(receivedStream).toBe(true);
    if (cancelAfter === undefined) expect(Date.now() - started).toBeGreaterThan(750);
    expect(Date.now() - started).toBeLessThan(maximum);
  } finally { clearTimeout(cancel); tokens.mockRestore(); server.closeAllConnections(); server.close(); }
}, 10000);

it.each(["0", "NaN", "Infinity", "9999999999"])("rejects an unsupported model deadline before starting a request: %s", timeout => {
  expect(() => createModel({ CREATOR_MODEL_BASE_URL: "http://127.0.0.1:1/v1", CREATOR_MODEL_API_KEY: "fixture", CREATOR_MODEL_TIMEOUT_SECONDS: timeout }, "invalid-timeout")).toThrow("CREATOR_MODEL_CONFIGURATION_INVALID: CREATOR_MODEL_TIMEOUT_SECONDS");
});
