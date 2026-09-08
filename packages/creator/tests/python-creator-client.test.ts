import { afterEach, describe, expect, it, vi } from "vitest";

const clientMocks = vi.hoisted(() => ({
  agents: [] as Array<{
    config: Record<string, unknown>;
    messages: unknown[];
    abortRun: ReturnType<typeof vi.fn>;
  }>,
  managers: [] as Array<{
    ensureStarted: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock("@ag-ui/client", () => ({
  HttpAgent: class HttpAgent {
    readonly config: Record<string, unknown>;
    readonly messages: unknown[];
    readonly abortRun = vi.fn();

    constructor(config: Record<string, unknown>) {
      this.config = config;
      this.messages = [...((config.initialMessages as unknown[] | undefined) ?? [])];
      clientMocks.agents.push(this);
    }

    addMessage(message: unknown) {
      this.messages.push(message);
    }

    async runAgent() {
      const response = {
        id: "assistant-1",
        role: "assistant",
        content: "Python result",
      };
      this.messages.push(response);
      return {
        result: { runtime: "python", receipt: { files: [], validations: [] } },
        newMessages: [response],
      };
    }
  },
}));

vi.mock("../src/PythonCreatorProcessManager.js", () => ({
  PythonCreatorProcessManager: class PythonCreatorProcessManager {
    readonly processId = 2468;
    readonly ensureStarted = vi.fn(async () => ({
      host: "127.0.0.1",
      port: 4321,
      authToken: "python-token",
      protocolVersion: "1",
      agentMode: "domain-write",
    }));
    readonly dispose = vi.fn(async () => undefined);

    constructor() {
      clientMocks.managers.push(this);
    }
  },
}));

import { createPythonCreatorClient } from "../src/PythonCreatorClient.js";

afterEach(() => {
  clientMocks.agents.splice(0);
  clientMocks.managers.splice(0);
});

describe("PythonCreatorClient", () => {
  it("runs the CLI/API client directly against the authenticated Python sidecar", async () => {
    const creator = createPythonCreatorClient({ projectRoot: "/tmp/project" });

    const result = await creator.run("change the UI");

    expect(result).toEqual({
      message: "Python result",
      result: {
        runtime: "python",
        receipt: { files: [], validations: [] },
      },
    });
    expect(clientMocks.agents[0]?.config).toMatchObject({
      url: "http://127.0.0.1:4321/creator",
      headers: { Authorization: "Bearer python-token" },
    });
    expect(clientMocks.agents[0]?.messages[0]).toMatchObject({
      role: "user",
      content: "change the UI",
    });
    expect(creator.processId).toBe(2468);

    await creator.dispose();
    expect(clientMocks.agents[0]?.abortRun).toHaveBeenCalledTimes(1);
    expect(clientMocks.managers[0]?.dispose).toHaveBeenCalledTimes(1);
  });

  it("rejects empty requests before starting Python", async () => {
    const creator = createPythonCreatorClient({ projectRoot: "/tmp/project" });

    await expect(creator.run("  ")).rejects.toThrow(/must not be empty/u);
    expect(clientMocks.managers[0]?.ensureStarted).not.toHaveBeenCalled();
  });
});
