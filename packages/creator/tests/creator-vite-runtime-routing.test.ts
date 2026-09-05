import { afterEach, describe, expect, it, vi } from "vitest";

const runtimeMocks = vi.hoisted(() => ({
  createTypeScriptAgent: vi.fn(() => ({ run: vi.fn() })),
  managerInstances: [] as Array<{
    ensureStarted: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }>,
  nextStartupError: undefined as Error | undefined,
  proxyPythonRequest: vi.fn(),
}));

vi.mock("../src/CreatorAgUiAdapter.js", () => ({
  createProjectCreatorAgUiAdapter: runtimeMocks.createTypeScriptAgent,
}));

vi.mock("../src/PythonCreatorProcessManager.js", () => {
  class PythonCreatorProcessManager {
    ensureStarted = vi.fn(async () => {
      if (runtimeMocks.nextStartupError !== undefined) {
        throw runtimeMocks.nextStartupError;
      }
      return {
        host: "127.0.0.1",
        port: 12345,
        authToken: "test-token",
        protocolVersion: "1",
        agentMode: "domain-write",
      };
    });

    dispose = vi.fn(async () => undefined);

    constructor() {
      runtimeMocks.managerInstances.push(this);
    }
  }

  class PythonCreatorRuntimeError extends Error {}

  return {
    CREATOR_PYTHON_PROTOCOL_VERSION: "1",
    CREATOR_PYTHON_START_TIMEOUT_MS: 15_000,
    CREATOR_PYTHON_STOP_TIMEOUT_MS: 3_000,
    PythonCreatorProcessManager,
    PythonCreatorRuntimeError,
  };
});

vi.mock("../src/PythonCreatorProxy.js", () => ({
  proxyPythonCreatorRequest: runtimeMocks.proxyPythonRequest,
}));

import {
  CREATOR_API_PATH,
  CREATOR_RUNTIME_DIAGNOSTICS_API_PATH,
  createCreatorDevServerPlugin,
} from "../src/vitePlugin.js";

type Middleware = (request: unknown, response: unknown) => Promise<void>;

function configuredMiddlewares(
  options: Parameters<typeof createCreatorDevServerPlugin>[0],
): Map<string, Middleware> {
  const middlewares = new Map<string, Middleware>();
  const plugin = createCreatorDevServerPlugin(options);
  const configureServer = plugin.configureServer as
    | ((server: unknown) => unknown)
    | undefined;
  if (typeof configureServer !== "function") {
    throw new Error("Creator Vite plugin must provide configureServer.");
  }
  configureServer({
    httpServer: { once: vi.fn() },
    watcher: { once: vi.fn() },
    middlewares: {
      use: (path: string, middleware: Middleware) => {
        middlewares.set(path, middleware);
      },
    },
  } as never);
  return middlewares;
}

function responseDouble() {
  return {
    destroyed: false,
    writableEnded: false,
    statusCode: 0,
    setHeader: vi.fn(),
    end: vi.fn(),
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  runtimeMocks.createTypeScriptAgent.mockClear();
  runtimeMocks.managerInstances.splice(0);
  runtimeMocks.nextStartupError = undefined;
  runtimeMocks.proxyPythonRequest.mockReset();
});

describe("Creator Vite runtime routing", () => {
  it("routes default run and diagnostics requests only through Python", async () => {
    vi.stubEnv("CREATOR_AGENT_RUNTIME", "");
    vi.stubEnv("CREATOR_PYTHON_AGENT_MODE", "");
    const log = vi.fn();
    runtimeMocks.proxyPythonRequest.mockResolvedValue(undefined);
    const middlewares = configuredMiddlewares({
      projectRoot: "/tmp/default-python-project",
      python: { environment: {}, log },
    });
    const request = {};
    const response = responseDouble();

    await middlewares.get(CREATOR_API_PATH)!(request, response);
    await middlewares.get(CREATOR_RUNTIME_DIAGNOSTICS_API_PATH)!(
      request,
      response,
    );

    expect(runtimeMocks.managerInstances).toHaveLength(1);
    expect(runtimeMocks.proxyPythonRequest).toHaveBeenNthCalledWith(
      1,
      request,
      response,
      runtimeMocks.managerInstances[0],
      "/creator",
    );
    expect(runtimeMocks.proxyPythonRequest).toHaveBeenNthCalledWith(
      2,
      request,
      response,
      runtimeMocks.managerInstances[0],
      "/runtime-diagnostics",
    );
    expect(runtimeMocks.createTypeScriptAgent).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("runtime=python agentMode=domain-write");
  });

  it("does not instantiate TypeScript when Python startup fails", async () => {
    vi.stubEnv("CREATOR_AGENT_RUNTIME", "");
    runtimeMocks.nextStartupError = new Error("python startup failed");
    runtimeMocks.proxyPythonRequest.mockImplementation(
      async (
        _request: unknown,
        response: ReturnType<typeof responseDouble>,
        manager: { ensureStarted: () => Promise<unknown> },
      ) => {
        try {
          await manager.ensureStarted();
        } catch (error) {
          response.statusCode = 503;
          response.end(String(error));
        }
      },
    );
    const middlewares = configuredMiddlewares({
      projectRoot: "/tmp/failing-python-project",
      python: { environment: {}, log: vi.fn() },
    });
    const response = responseDouble();

    await middlewares.get(CREATOR_API_PATH)!({}, response);

    expect(response.statusCode).toBe(503);
    expect(runtimeMocks.createTypeScriptAgent).not.toHaveBeenCalled();
  });

  it("keeps TypeScript available only through an explicit legacy override", async () => {
    vi.stubEnv("CREATOR_AGENT_RUNTIME", "python");
    const log = vi.fn();
    const middlewares = configuredMiddlewares({
      projectRoot: "/tmp/legacy-typescript-project",
      runtime: "typescript",
      python: { log },
    });
    const response = responseDouble();

    await middlewares.get(CREATOR_API_PATH)!({ method: "GET" }, response);

    expect(runtimeMocks.managerInstances).toHaveLength(0);
    expect(runtimeMocks.proxyPythonRequest).not.toHaveBeenCalled();
    expect(runtimeMocks.createTypeScriptAgent).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      "WARNING: TypeScript Creator runtime is legacy. Python is the default Creator control plane.",
    );
  });
});
