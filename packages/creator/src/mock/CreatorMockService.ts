import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import {
  createMockAgentHttpHandler,
  createScenarioRegistry,
  showcaseMockScenarios,
} from "@agent-ui/mock-agent";
import type { CreatorMockState } from "./types.js";

export function isLocalMockOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (url.protocol === "http:" || url.protocol === "https:") &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch { return false; }
}

/** Creator-owned development service; never loaded by a generated Agent app. */
export class CreatorMockService {
  private server: Server | undefined;
  private endpoint: string | null = null;
  private scenarioId = "reasoning-tool-success";
  private speed = 1;
  private disposed = false;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly registry = createScenarioRegistry({
    scenarios: showcaseMockScenarios,
    defaultScenarioId: "reasoning-tool-success",
  });
  private readonly handler = createMockAgentHttpHandler({ registry: this.registry });

  getState(): CreatorMockState {
    return {
      status: this.endpoint === null ? "stopped" : "running",
      endpoint: this.endpoint,
      scenarioId: this.scenarioId,
      speed: this.speed,
      scenarios: this.registry.list(),
    };
  }

  select(scenarioId: unknown, speed: unknown): CreatorMockState {
    if (typeof scenarioId !== "string" || this.registry.get(scenarioId) === undefined) {
      throw new Error("请选择有效的 Mock Demo。");
    }
    if (typeof speed !== "number" || !Number.isFinite(speed) || speed < 0 || speed > 10) {
      throw new Error("播放时长倍率必须在 0 到 10 之间。");
    }
    this.scenarioId = scenarioId;
    this.speed = speed;
    return this.getState();
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }

  start(): Promise<CreatorMockState> {
    return this.serialize(async () => {
      if (this.disposed) throw new Error("Creator 已退出，无法启动 Mock 服务。");
      if (this.server !== undefined) return this.getState();
      const server = createServer((request, response) => {
        void this.handle(request, response).catch((error: unknown) => {
          if (response.headersSent) { response.destroy(); return; }
          response.statusCode = 500;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Mock 请求失败" }));
        });
      });
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          server.removeListener("error", reject);
          resolve();
        });
      });
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        throw new Error("无法获取 Mock 服务地址。");
      }
      this.server = server;
      this.endpoint = `http://127.0.0.1:${address.port}/agent`;
      server.once("close", () => {
        if (this.server === server) { this.server = undefined; this.endpoint = null; }
      });
      return this.getState();
    });
  }

  stop(): Promise<CreatorMockState> {
    return this.serialize(async () => {
      const server = this.server;
      if (server !== undefined) {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => error ? reject(error) : resolve());
          // Includes active SSE requests; stop must not wait for a slow Demo.
          server.closeAllConnections();
        });
      }
      this.server = undefined;
      this.endpoint = null;
      return this.getState();
    });
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    await this.stop();
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const origin = request.headers.origin;
    if ((origin !== undefined && !isLocalMockOrigin(origin)) ||
        !isLocalMockOrigin(`http://${request.headers.host ?? ""}`)) {
      response.statusCode = 403;
      response.end("Mock service accepts local development clients only.");
      return;
    }
    if (origin !== undefined) {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Vary", "Origin");
      response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      response.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization");
      response.setHeader("Access-Control-Allow-Private-Network", "true");
    }
    if (request.method === "OPTIONS") { response.statusCode = 204; response.end(); return; }
    const url = new URL(request.url ?? "/", "http://mock.local");
    if (url.pathname !== "/agent" && url.pathname !== "/agent/scenarios") {
      response.statusCode = 404; response.end(); return;
    }
    if (url.pathname === "/agent/scenarios") {
      response.setHeader("Content-Type", "application/json");
      if (request.method !== "GET") { response.statusCode = 405; response.end(); return; }
      response.end(JSON.stringify({ defaultScenarioId: this.scenarioId, scenarios: this.registry.list() }));
      return;
    }
    // Snapshot the panel selection for this request; changing the panel never
    // changes an already-running stream. Explicit scenario URLs still work.
    if (!url.searchParams.has("scenario")) url.searchParams.set("scenario", this.scenarioId);
    if (!url.searchParams.has("speed")) url.searchParams.set("speed", String(this.speed));
    request.url = `${url.pathname}${url.search}`;
    await this.handler(request, response);
  }
}
