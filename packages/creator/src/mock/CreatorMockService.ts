import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import {
  createMockAgentHttpHandler,
  createScenarioRegistry,
  showcaseMockScenarios,
  runMockRecording,
  withPreviewAgentState,
  MockDurableRunStore,
  type MockAgentHttpHandler,
} from "@agent-ui/mock-agent";
import { LocalMockRecordingStore, type LocalMockRecordingSummary } from "./local-recording-store.js";
import type { MockProjectTarget } from "./demo-compatibility.js";
import type { CreatorMockSelection, CreatorMockState } from "./types.js";

export const DEFAULT_CREATOR_MOCK_PORT = 47831;

export function isLocalMockOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (url.protocol === "http:" || url.protocol === "https:") &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch { return false; }
}

/** Creator-owned development service; never loaded by a generated Agent app. */
export class CreatorMockService {
  constructor(private readonly options: { port?: number } = {}) {}

  private server: Server | undefined;
  private endpoint: string | null = null;
  private scenarioId = "reasoning-tool-success";
  private speed = 1;
  private selection: CreatorMockSelection = { type: "builtin", id: "reasoning-tool-success" };
  private selectedProject: MockProjectTarget | undefined;
  private resolveProject: (() => MockProjectTarget | undefined) | undefined;
  private recordings: LocalMockRecordingSummary[] = [];
  private recordingsError: string | undefined;
  private catalogProject: MockProjectTarget | undefined;
  private readonly recordingStore = new LocalMockRecordingStore();

  setProjectResolver(resolveProject: (() => MockProjectTarget | undefined) | undefined): void { this.resolveProject = resolveProject; }
  private sameProject(first: MockProjectTarget | undefined, second: MockProjectTarget | undefined): boolean {
    return first?.id === second?.id && first?.projectRoot === second?.projectRoot;
  }
  private syncProject(): MockProjectTarget | undefined {
    const project = this.resolveProject?.();
    if (!this.sameProject(project, this.catalogProject)) { this.recordings = []; this.recordingsError = undefined; }
    if (this.selection.type === "recording" && !this.sameProject(project, this.selectedProject)) {
      this.selection = { type: "builtin", id: this.registry.defaultScenarioId };
      this.scenarioId = this.registry.defaultScenarioId;
      this.selectedProject = undefined;
    }
    return project;
  }
  async refreshState(): Promise<CreatorMockState> {
    const project = this.syncProject();
    let recordings: LocalMockRecordingSummary[] = [];
    let error: string | undefined;
    try { if (project) recordings = await this.recordingStore.list(project.projectRoot); }
    catch (failure) { error = failure instanceof Error ? failure.message : "Unable to read local recordings."; }
    if (this.sameProject(project, this.resolveProject?.())) {
      this.catalogProject = project; this.recordings = recordings; this.recordingsError = error;
    }
    return this.getState();
  }
  async selectRecording(recordingId: unknown, speed: unknown, projectId: unknown): Promise<CreatorMockState> {
    const project = this.syncProject();
    if (!project || project.id !== projectId) throw new Error("当前项目已切换，请重新选择本地 Mock。");
    this.validateSpeed(speed);
    if (typeof recordingId !== "string") throw new Error("请选择有效的本地 Mock。");
    const recording = await this.recordingStore.get(project.projectRoot, recordingId);
    if (!recording) throw new Error("本地 Mock 无法读取，请刷新后检查文件。");
    if (!this.sameProject(project, this.resolveProject?.())) throw new Error("当前项目已切换，请重新选择本地 Mock。");
    this.selection = { type: "recording", id: recordingId }; this.selectedProject = { ...project }; this.speed = speed;
    return this.refreshState();
  }
  private validateSpeed(speed: unknown): asserts speed is number {
    if (typeof speed !== "number" || !Number.isFinite(speed) || speed < 0 || speed > 10) throw new Error("播放时长倍率必须在 0 到 10 之间。");
  }
  private disposed = false;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly registry = createScenarioRegistry({
    scenarios: showcaseMockScenarios,
    defaultScenarioId: "reasoning-tool-success",
  });
  private readonly previewRegistry = createScenarioRegistry({
    scenarios: showcaseMockScenarios.map(withPreviewAgentState), defaultScenarioId: "reasoning-tool-success",
  });
  private readonly durableStores = new Map<string | undefined, MockDurableRunStore>();
  private readonly scopedHandlers = new WeakMap<MockDurableRunStore, { normal: MockAgentHttpHandler; preview: MockAgentHttpHandler }>();

  /** Key by project root: legacy Mock controls and workspace APIs can use different IDs. */
  getDurableStore(projectRoot?: string): MockDurableRunStore {
    let store = this.durableStores.get(projectRoot);
    if (!store) { store = new MockDurableRunStore(); this.durableStores.set(projectRoot, store); }
    return store;
  }

  private handlersFor(durableStore: MockDurableRunStore) {
    let handlers = this.scopedHandlers.get(durableStore);
    if (!handlers) {
      handlers = {
        normal: createMockAgentHttpHandler({ registry: this.registry, durableStore }),
        preview: createMockAgentHttpHandler({ registry: this.previewRegistry, durableStore }),
      };
      this.scopedHandlers.set(durableStore, handlers);
    }
    return handlers;
  }

  getState(): CreatorMockState {
    const project = this.syncProject();
    return {
      status: this.endpoint === null ? "stopped" : "running",
      endpoint: this.endpoint,
      scenarioId: this.scenarioId,
      selection: { ...this.selection }, projectId: project?.id ?? null, recordings: this.recordings,
      ...(this.recordingsError === undefined ? {} : { recordingsError: this.recordingsError }),
      speed: this.speed,
      scenarios: this.registry.list().map(({ id, title, description, resources, category, capabilities }) => ({
        id, title,
        ...(description === undefined ? {} : { description }),
        ...(resources === undefined ? {} : { resources }),
        ...(category === undefined ? {} : { category }),
        ...(capabilities === undefined ? {} : { capabilities }),
      })),
    };
  }

  select(scenarioId: unknown, speed: unknown): CreatorMockState {
    if (typeof scenarioId !== "string" || this.registry.get(scenarioId) === undefined) {
      throw new Error("请选择有效的 Mock Demo。");
    }
    this.validateSpeed(speed);
    this.selection = { type: "builtin", id: scenarioId };
    this.selectedProject = undefined;
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
        server.listen(this.options.port ?? DEFAULT_CREATOR_MOCK_PORT, "127.0.0.1", () => {
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

  /** Same service selection/replay at the fixed Creator preview endpoint. */
  async handlePreviewRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", "http://mock.local");
    request.url = `/agent${url.search}`;
    await this.handle(request, response, true);
  }

  private async handle(request: IncomingMessage, response: ServerResponse, preview = false): Promise<void> {
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
      response.end(JSON.stringify({ defaultScenarioId: this.scenarioId, scenarios: this.getState().scenarios }));
      return;
    }
    const activeProject = this.syncProject();
    const durableStore = this.getDurableStore(activeProject?.projectRoot);
    const selection = { ...this.selection };
    const project = this.selectedProject;
    // Snapshot the panel selection for this request; changing the panel never
    // changes an already-running stream. Explicit scenario URLs still work.
    const useRecording = selection.type === "recording" && !url.searchParams.has("scenario");
    if (!useRecording && !url.searchParams.has("scenario")) url.searchParams.set("scenario", this.scenarioId);
    if (!url.searchParams.has("speed")) url.searchParams.set("speed", String(this.speed));
    request.url = `${url.pathname}${url.search}`;
    if (useRecording) {
      const handler = createMockAgentHttpHandler({ registry: this.registry, durableStore, resolveRun: async (input, options) => {
        if (!project || !this.sameProject(project, this.resolveProject?.())) throw new Error("当前项目已切换，请重新选择本地 Mock。");
        const recording = await this.recordingStore.get(project.projectRoot, selection.id);
        if (!this.sameProject(project, this.resolveProject?.())) throw new Error("当前项目已切换，请重新选择本地 Mock。");
        if (!recording) throw new Error("本地 Mock 已删除或无效，请重新选择。");
        return runMockRecording(input, recording, { signal: options.signal, timingScale: options.speed });
      } });
      await handler(request, response);
    } else {
      const handlers = this.handlersFor(durableStore);
      await (preview ? handlers.preview : handlers.normal)(request, response);
    }
  }
}
