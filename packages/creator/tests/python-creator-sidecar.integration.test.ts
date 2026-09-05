import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";
import { EventSchemas } from "@ag-ui/core";

import {
  CREATOR_PYTHON_PROTOCOL_VERSION,
  PythonCreatorProcessManager,
} from "../src/PythonCreatorProcessManager.js";
import { proxyPythonCreatorRequest } from "../src/PythonCreatorProxy.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const projectRoot = path.join(repositoryRoot, "examples/agent-frontend");
const pythonPackageRoot = path.join(repositoryRoot, "packages/creator-python");
const skillsRoot = path.join(repositoryRoot, "packages/creator/skills");
const contractsRoot = path.join(repositoryRoot, "contracts/creator/fixtures");
const virtualEnvironmentPython =
  process.platform === "win32"
    ? path.join(pythonPackageRoot, ".venv", "Scripts", "python.exe")
    : path.join(pythonPackageRoot, ".venv", "bin", "python");
const pythonExecutable =
  process.env.CREATOR_PYTHON_EXECUTABLE?.trim() ||
  (existsSync(virtualEnvironmentPython)
    ? virtualEnvironmentPython
    : process.platform === "win32"
      ? "python"
      : "python3");
const skipIntegration = process.env.CREATOR_SKIP_PYTHON_INTEGRATION === "1";

interface SseEvent {
  type: string;
  [key: string]: unknown;
}

const managers: PythonCreatorProcessManager[] = [];
const servers: Server[] = [];
const temporaryDirectories: string[] = [];

function manager(
  options: Partial<ConstructorParameters<typeof PythonCreatorProcessManager>[0]> = {},
): PythonCreatorProcessManager {
  const defaultEnvironment = { ...process.env };
  delete defaultEnvironment.CREATOR_PYTHON_AGENT_MODE;
  const instance = new PythonCreatorProcessManager({
    projectRoot,
    pythonPackageRoot,
    pythonExecutable,
    skillsRoot,
    environment: defaultEnvironment,
    log: () => undefined,
    ...options,
  });
  managers.push(instance);
  return instance;
}

async function fixture(name: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path.join(contractsRoot, name), "utf8")) as Record<
    string,
    unknown
  >;
}

async function waitForProcessExit(pid: number, timeoutMs = 5_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") {
        return true;
      }
      if ((error as NodeJS.ErrnoException).code !== "EPERM") {
        throw error;
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
  }
  return false;
}

async function createProxyServer(
  processManager: PythonCreatorProcessManager,
): Promise<string> {
  const server = createServer((request, response) => {
    if (request.url === "/creator") {
      void proxyPythonCreatorRequest(request, response, processManager, "/creator");
      return;
    }
    if (request.url === "/runtime-diagnostics") {
      void proxyPythonCreatorRequest(
        request,
        response,
        processManager,
        "/runtime-diagnostics",
      );
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function createMockChatCompletionsServer(): Promise<string> {
  let call = 0;
  const server = createServer((request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      response.statusCode = 404;
      response.end();
      return;
    }
    request.resume();
    request.once("end", () => {
      call += 1;
      const toolCalls = [
        {
          id: "call-read-before",
          type: "function",
          function: {
            name: "read_file",
            arguments: JSON.stringify({ file_path: "/plugins/activity.ts" }),
          },
        },
        {
          id: "call-edit",
          type: "function",
          function: {
            name: "edit_file",
            arguments: JSON.stringify({
              file_path: "/plugins/activity.ts",
              old_string: '"old"',
              new_string: '"new"',
            }),
          },
        },
        {
          id: "call-read-after",
          type: "function",
          function: {
            name: "read_file",
            arguments: JSON.stringify({ file_path: "/plugins/activity.ts" }),
          },
        },
      ];
      const selected = toolCalls[call - 1];
      const body = JSON.stringify({
        id: `completion-${call}`,
        object: "chat.completion",
        created: 1,
        model: "mimo-v2.5-pro",
        choices: [
          {
            index: 0,
            message:
              selected === undefined
                ? { role: "assistant", content: "Updated and verified activity.ts." }
                : { role: "assistant", content: null, tool_calls: [selected] },
            finish_reason: selected === undefined ? "stop" : "tool_calls",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });
      response.statusCode = 200;
      response.setHeader("Content-Type", "application/json");
      response.end(body);
    });
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}/v1`;
}

async function createDomainReadMockChatCompletionsServer(): Promise<string> {
  let call = 0;
  const server = createServer((request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      response.statusCode = 404;
      response.end();
      return;
    }
    request.resume();
    request.once("end", () => {
      call += 1;
      const toolCalls = [
        {
          id: "call-inspect-project",
          type: "function",
          function: { name: "inspect_ui_project", arguments: "{}" },
        },
        {
          id: "call-inspect-plugin",
          type: "function",
          function: {
            name: "inspect_ui_plugin",
            arguments: JSON.stringify({ pluginId: "workspace-inspector" }),
          },
        },
        {
          id: "call-read-manifest",
          type: "function",
          function: {
            name: "read_file",
            arguments: JSON.stringify({
              file_path: "/plugins/workspace-inspector/manifest.json",
            }),
          },
        },
      ];
      const selected = toolCalls[call - 1];
      const body = JSON.stringify({
        id: `domain-completion-${call}`,
        object: "chat.completion",
        created: 1,
        model: "mimo-v2.5-pro",
        choices: [
          {
            index: 0,
            message:
              selected === undefined
                ? { role: "assistant", content: "Inspected authoritative plugin state." }
                : { role: "assistant", content: null, tool_calls: [selected] },
            finish_reason: selected === undefined ? "stop" : "tool_calls",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });
      response.statusCode = 200;
      response.setHeader("Content-Type", "application/json");
      response.end(body);
    });
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}/v1`;
}

async function createDomainWriteMockChatCompletionsServer(
  appUIModelHash: string,
  instanceId: string,
): Promise<string> {
  let call = 0;
  const server = createServer((request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      response.statusCode = 404;
      response.end();
      return;
    }
    request.resume();
    request.once("end", () => {
      call += 1;
      const toolCalls = [
        {
          id: "call-inspect-app-ui-model",
          type: "function",
          function: { name: "inspect_app_ui_model", arguments: "{}" },
        },
        {
          id: "call-mutate-app-ui-model",
          type: "function",
          function: {
            name: "mutate_app_ui_model",
            arguments: JSON.stringify({
              appUIModelHash,
              operations: [
                {
                  type: "update_instance_props",
                  instanceId,
                  set: { phase3B2NodePython: true },
                },
              ],
            }),
          },
        },
      ];
      const selected = toolCalls[call - 1];
      response.statusCode = 200;
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          id: `domain-write-completion-${call}`,
          object: "chat.completion",
          created: 1,
          model: "mimo-v2.5-pro",
          choices: [
            {
              index: 0,
              message:
                selected === undefined
                  ? {
                      role: "assistant",
                      content:
                        "AppUIModel static composition committed; runtime verification was not run.",
                    }
                  : { role: "assistant", content: null, tool_calls: [selected] },
              finish_reason: selected === undefined ? "stop" : "tool_calls",
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      );
    });
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}/v1`;
}

async function copyTargetProject(label: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), `creator-${label}-`));
  temporaryDirectories.push(root);
  await cp(projectRoot, root, {
    recursive: true,
    filter: (entry) =>
      !["node_modules", "dist", ".agentuicreator"].includes(
        path.basename(entry),
      ),
  });
  await symlink(path.join(projectRoot, "node_modules"), path.join(root, "node_modules"));
  return root;
}

async function delayProjectControl(root: string, delaySeconds: number): Promise<void> {
  if (process.platform === "win32") {
    throw new Error("The delayed Project Control fixture requires a POSIX shell.");
  }
  const nodeModules = path.join(root, "node_modules");
  await rm(nodeModules, { force: true });
  await mkdir(path.join(nodeModules, ".bin"), { recursive: true });
  for (const dependency of ["typescript", "zod"]) {
    await symlink(
      path.join(projectRoot, "node_modules", dependency),
      path.join(nodeModules, dependency),
    );
  }
  const executable = path.join(nodeModules, ".bin", "tsx");
  const realExecutable = path.join(projectRoot, "node_modules", ".bin", "tsx");
  await writeFile(
    executable,
    `#!/bin/sh\nsleep ${delaySeconds}\nexec "${realExecutable}" "$@"\n`,
  );
  await chmod(executable, 0o755);
}

async function readSseEvents(response: Response): Promise<{
  events: SseEvent[];
  chunksRead: number;
}> {
  const reader = response.body?.getReader();
  expect(reader).toBeDefined();
  const decoder = new TextDecoder();
  const events: SseEvent[] = [];
  let chunksRead = 0;
  let pending = "";
  while (true) {
    const result = await reader!.read();
    if (result.done) {
      pending += decoder.decode();
      break;
    }
    chunksRead += 1;
    pending += decoder.decode(result.value, { stream: true });
    let separator = pending.search(/\r?\n\r?\n/u);
    while (separator >= 0) {
      const block = pending.slice(0, separator);
      const separatorLength = pending.startsWith("\r\n\r\n", separator) ? 4 : 2;
      pending = pending.slice(separator + separatorLength);
      const data = block
        .split(/\r?\n/u)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data !== "") {
        events.push(JSON.parse(data) as SseEvent);
      }
      separator = pending.search(/\r?\n\r?\n/u);
    }
  }
  return { events, chunksRead };
}

async function fakePythonPackage(source: string): Promise<{
  packageRoot: string;
  pidFile: string;
}> {
  const packageRoot = await mkdtemp(path.join(tmpdir(), "creator-python-fixture-"));
  temporaryDirectories.push(packageRoot);
  const moduleRoot = path.join(packageRoot, "agent_ui_creator");
  const pidFile = path.join(packageRoot, "child.pid");
  await mkdir(moduleRoot);
  await writeFile(path.join(packageRoot, "pyproject.toml"), "[project]\nname='fixture'\n");
  await writeFile(path.join(moduleRoot, "__init__.py"), "");
  await writeFile(path.join(moduleRoot, "server.py"), source);
  return { packageRoot, pidFile };
}

afterEach(async () => {
  await Promise.all(managers.splice(0).map((instance) => instance.dispose()));
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

(skipIntegration ? describe.skip : describe)("Python Creator real sidecar integration", () => {
  it("requires Python 3.11+ with the sidecar dependencies", () => {
    const preflight = spawnSync(
      pythonExecutable,
      [
        "-c",
        "import sys, ag_ui, deepagents, fastapi, httpx, langchain_openai, langgraph, pydantic, uvicorn; assert sys.version_info >= (3, 11)",
      ],
      { encoding: "utf8" },
    );

    expect(preflight.status, preflight.stderr || preflight.error?.message).toBe(0);
  });

  it("starts real authenticated sidecars on independent dynamic ports", async () => {
    const first = manager();
    const second = manager();
    const [firstEndpoint, secondEndpoint] = await Promise.all([
      first.ensureStarted(),
      second.ensureStarted(),
    ]);

    expect(first.processId).toBeGreaterThan(0);
    expect(second.processId).toBeGreaterThan(0);
    expect(firstEndpoint).toMatchObject({
      host: "127.0.0.1",
      agentMode: "domain-write",
      protocolVersion: CREATOR_PYTHON_PROTOCOL_VERSION,
    });
    expect(firstEndpoint.port).toBeGreaterThan(0);
    expect(firstEndpoint.port).not.toBe(secondEndpoint.port);
    expect(firstEndpoint.authToken).toHaveLength(64);

    const health = await fetch(
      `http://${firstEndpoint.host}:${firstEndpoint.port}/health`,
      { headers: { Authorization: `Bearer ${firstEndpoint.authToken}` } },
    );
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toMatchObject({
      status: "ok",
      runtime: "python",
      agentMode: "domain-write",
      protocolVersion: CREATOR_PYTHON_PROTOCOL_VERSION,
    });

    const request = (await fixture("ag-ui-echo.json")).request;
    const unauthorized = await fetch(
      `http://${firstEndpoint.host}:${firstEndpoint.port}/creator`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      },
    );
    const wrongToken = await fetch(
      `http://${firstEndpoint.host}:${firstEndpoint.port}/creator`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer wrong-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      },
    );
    expect(unauthorized.status).toBe(401);
    expect(wrongToken.status).toBe(401);
  }, 30_000);

  it("starts from the managed virtual environment without an explicit executable", async () => {
    const logs: string[] = [];
    const environment = { ...process.env };
    delete environment.CREATOR_PYTHON_EXECUTABLE;
    const processManager = manager({
      pythonExecutable: undefined,
      environment,
      log: (message) => logs.push(message),
    });

    const endpoint = await processManager.ensureStarted();
    const health = await fetch(
      `http://${endpoint.host}:${endpoint.port}/health`,
      { headers: { Authorization: `Bearer ${endpoint.authToken}` } },
    );

    expect(health.status).toBe(200);
    expect(logs).toContain(
      `python runtime: source=managed_venv executable=${virtualEnvironmentPython}`,
    );
    expect(logs).toContainEqual(
      expect.stringMatching(
        /^python sidecar ready pid=\d+ port=\d+ pythonSource=managed_venv agentMode=domain-write$/u,
      ),
    );
  }, 30_000);

  it("streams the exact Unicode AG-UI lifecycle through the production proxy", async () => {
    const processManager = manager({
      environment: {
        ...process.env,
        CREATOR_PYTHON_AGENT_MODE: "echo",
      },
    });
    const proxyRoot = await createProxyServer(processManager);
    const golden = await fixture("ag-ui-echo.json");
    const response = await fetch(`${proxyRoot}/creator`, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        Authorization: "Bearer browser-token-must-be-replaced",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(golden.request),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const { events, chunksRead } = await readSseEvents(response);
    const eventTypes = events.map((event) => event.type);
    expect(chunksRead).toBeGreaterThan(0);
    expect(eventTypes).toEqual(golden.eventTypes);
    expect(eventTypes.indexOf("RUN_STARTED")).toBeLessThan(
      eventTypes.indexOf("RUN_FINISHED"),
    );
    expect(events.find((event) => event.type === "TEXT_MESSAGE_CONTENT")).toMatchObject({
      delta: "hello-python-sidecar-测试",
    });
  }, 30_000);

  it("forwards tool start before a delayed upstream tool result", async () => {
    const fixturePackage = await fakePythonPackage(`
import argparse, json, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
parser = argparse.ArgumentParser()
parser.add_argument("--auth-token", required=True)
arguments, _ = parser.parse_known_args()
class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def authorized(self):
        return self.headers.get("Authorization") == "Bearer " + arguments.auth_token
    def do_GET(self):
        if self.path != "/health" or not self.authorized():
            self.send_response(401)
            self.end_headers()
            return
        body = json.dumps({"status": "ok", "runtime": "python", "agentMode": "domain-write", "protocolVersion": "1"}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def do_POST(self):
        if self.path != "/creator" or not self.authorized():
            self.send_response(401)
            self.end_headers()
            return
        self.rfile.read(int(self.headers.get("Content-Length", "0")))
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache, no-transform")
        self.send_header("Connection", "close")
        self.end_headers()
        first = "".join([
            'data: {"type":"RUN_STARTED","threadId":"thread","runId":"run"}\\n\\n',
            'data: {"type":"TOOL_CALL_START","toolCallId":"call-1","toolCallName":"read_file"}\\n\\n',
            'data: {"type":"TOOL_CALL_ARGS","toolCallId":"call-1","delta":"{}"}\\n\\n',
            'data: {"type":"TOOL_CALL_END","toolCallId":"call-1"}\\n\\n',
        ]).encode()
        self.wfile.write(first)
        self.wfile.flush()
        time.sleep(0.75)
        second = "".join([
            'data: {"type":"TOOL_CALL_RESULT","messageId":"result-1","toolCallId":"call-1","content":"done","role":"tool"}\\n\\n',
            'data: {"type":"RUN_FINISHED","threadId":"thread","runId":"run","result":{}}\\n\\n',
        ]).encode()
        self.wfile.write(second)
        self.wfile.flush()
        self.close_connection = True
    def log_message(self, _format, *args):
        return
server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
print(json.dumps({"type": "creator_ready", "port": server.server_address[1], "protocolVersion": "1"}), flush=True)
server.serve_forever()
`);
    const processManager = manager({
      pythonPackageRoot: fixturePackage.packageRoot,
    });
    await processManager.ensureStarted();
    const proxyRoot = await createProxyServer(processManager);
    const startedAt = Date.now();
    const response = await fetch(`${proxyRoot}/creator`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [] }),
    });
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const first = await reader.read();
    const firstText = decoder.decode(first.value, { stream: true });

    expect(Date.now() - startedAt).toBeLessThan(700);
    expect(firstText).toContain('"type":"TOOL_CALL_START"');
    expect(firstText).toContain('"type":"TOOL_CALL_END"');
    expect(firstText).not.toContain('"type":"TOOL_CALL_RESULT"');

    let remaining = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        remaining += decoder.decode();
        break;
      }
      remaining += decoder.decode(chunk.value, { stream: true });
    }
    expect(remaining).toContain('"type":"TOOL_CALL_RESULT"');
    expect(remaining).toContain('"type":"RUN_FINISHED"');
  }, 30_000);

  it("runs Node to Vite proxy to Python minimal agent with real file tools", async () => {
    const fixtureRoot = await mkdtemp(path.join(tmpdir(), "creator-minimal-project-"));
    temporaryDirectories.push(fixtureRoot);
    await mkdir(path.join(fixtureRoot, "plugins"));
    const target = path.join(fixtureRoot, "plugins", "activity.ts");
    await writeFile(target, 'export const activity = "old";\n');
    const modelBaseUrl = await createMockChatCompletionsServer();
    const processManager = manager({
      projectRoot: fixtureRoot,
      environment: {
        ...process.env,
        CREATOR_PYTHON_AGENT_MODE: "minimal",
        CREATOR_MODEL_NAME: "mimo-v2.5-pro",
        CREATOR_MODEL_BASE_URL: modelBaseUrl,
        CREATOR_MODEL_API_KEY: "test-api-key",
        CREATOR_MODEL_RAW_TRACE: "1",
      },
    });
    const proxyRoot = await createProxyServer(processManager);
    const response = await fetch(`${proxyRoot}/creator`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId: "minimal-thread",
        runId: "minimal-run",
        messages: [
          {
            role: "user",
            content: "Read plugins/activity.ts, change old to new, then read it again.",
          },
        ],
      }),
    });
    const { events } = await readSseEvents(response);

    for (const event of events) {
      expect(() => EventSchemas.parse(event)).not.toThrow();
    }

    expect(events.map((event) => event.type)).toEqual([
      "RUN_STARTED",
      "TOOL_CALL_START",
      "TOOL_CALL_ARGS",
      "TOOL_CALL_END",
      "TOOL_CALL_RESULT",
      "TOOL_CALL_START",
      "TOOL_CALL_ARGS",
      "TOOL_CALL_END",
      "TOOL_CALL_RESULT",
      "TOOL_CALL_START",
      "TOOL_CALL_ARGS",
      "TOOL_CALL_END",
      "TOOL_CALL_RESULT",
      "TEXT_MESSAGE_START",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_END",
      "RUN_FINISHED",
    ]);
    expect(await readFile(target, "utf8")).toContain('"new"');
    expect(events.at(-1)?.result).toMatchObject({
      phase: "minimal-agent",
      toolProtocol: {
        modelCalls: 4,
        toolCalls: 3,
        validToolCalls: 3,
        traces: expect.arrayContaining([
          expect.objectContaining({
            providerResponse: expect.objectContaining({
              statusCode: 200,
              toolCallCount: 1,
              toolCallNames: ["read_file"],
            }),
            translationMismatch: null,
            toolCallOrigin: "provider",
          }),
        ]),
      },
    });
  }, 60_000);

  it("runs the domain-read agent through a mock provider and real target control entry", async () => {
    const modelBaseUrl = await createDomainReadMockChatCompletionsServer();
    const processManager = manager({
      environment: {
        ...process.env,
        CREATOR_PYTHON_AGENT_MODE: "domain-read",
        CREATOR_MODEL_NAME: "mimo-v2.5-pro",
        CREATOR_MODEL_BASE_URL: modelBaseUrl,
        CREATOR_MODEL_API_KEY: "test-api-key",
      },
    });
    const proxyRoot = await createProxyServer(processManager);
    const response = await fetch(`${proxyRoot}/creator`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId: "domain-thread",
        runId: "domain-run",
        messages: [
          {
            role: "user",
            content: "Inspect the workspace-inspector plugin and its manifest.",
          },
        ],
      }),
    });
    const { events } = await readSseEvents(response);
    const toolStarts = events
      .filter((event) => event.type === "TOOL_CALL_START")
      .map((event) => event.toolCallName);

    expect(toolStarts).toEqual([
      "inspect_ui_project",
      "inspect_ui_plugin",
      "read_file",
    ]);
    expect(toolStarts).not.toContain("mutate_app_ui_model");
    expect(events.at(-1)?.result).toMatchObject({
      phase: "domain-read-agent",
      toolProtocol: { modelCalls: 4, toolCalls: 3, validToolCalls: 3 },
      projectControl: {
        requests: 2,
        byOperation: {
          inspect_ui_project: 1,
          inspect_ui_plugin: 1,
        },
        failures: 0,
      },
    });
  }, 60_000);

  it.skipIf(process.platform === "win32")(
    "streams a real DeepAgents tool start through the proxy before delayed Project Control finishes",
    async () => {
      const fixtureRoot = await copyTargetProject("delayed-domain-read");
      await delayProjectControl(fixtureRoot, 1.5);
      const modelBaseUrl = await createDomainReadMockChatCompletionsServer();
      const processManager = manager({
        projectRoot: fixtureRoot,
        environment: {
          ...process.env,
          CREATOR_PYTHON_AGENT_MODE: "domain-read",
          CREATOR_MODEL_NAME: "mimo-v2.5-pro",
          CREATOR_MODEL_BASE_URL: modelBaseUrl,
          CREATOR_MODEL_API_KEY: "test-api-key",
        },
      });
      const proxyRoot = await createProxyServer(processManager);
      const response = await fetch(`${proxyRoot}/creator`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: "delayed-domain-thread",
          runId: "delayed-domain-run",
          messages: [{ role: "user", content: "Inspect the project." }],
        }),
      });
      const reader = response.body?.getReader();
      expect(reader).toBeDefined();
      const decoder = new TextDecoder();
      let beforeToolResult = "";
      while (!beforeToolResult.includes('"type":"TOOL_CALL_START"')) {
        const chunk = await reader!.read();
        expect(chunk.done).toBe(false);
        beforeToolResult += decoder.decode(chunk.value, { stream: true });
      }

      expect(beforeToolResult).toContain('"toolCallId":"call-inspect-project"');
      expect(beforeToolResult).not.toContain('"type":"TOOL_CALL_RESULT"');

      let remainder = "";
      while (true) {
        const chunk = await reader!.read();
        if (chunk.done) {
          remainder += decoder.decode();
          break;
        }
        remainder += decoder.decode(chunk.value, { stream: true });
      }
      const completeWire = beforeToolResult + remainder;
      expect(completeWire.match(/"type":"TOOL_CALL_START"/gu)).toHaveLength(3);
      expect(completeWire.match(/"type":"TOOL_CALL_RESULT"/gu)).toHaveLength(3);
      expect(completeWire).toContain('"type":"RUN_FINISHED"');
    },
    60_000,
  );

  it("runs default Python domain-write through inspect and one semantic mutation", async () => {
    const fixtureRoot = await copyTargetProject("domain-write-project");
    const appUIModelPath = path.join(fixtureRoot, "app-ui/app-ui.json");
    const beforeSource = await readFile(appUIModelPath, "utf8");
    const appUIModelHash = createHash("sha256")
      .update(beforeSource)
      .digest("hex");
    const model = JSON.parse(beforeSource) as {
      pluginInstances: Record<string, unknown>;
    };
    const instanceId = Object.keys(model.pluginInstances)[0];
    if (!instanceId) {
      throw new Error("Domain-write fixture requires one PluginInstance.");
    }
    const modelBaseUrl = await createDomainWriteMockChatCompletionsServer(
      appUIModelHash,
      instanceId,
    );
    const processManager = manager({
      projectRoot: fixtureRoot,
      environment: {
        ...process.env,
        CREATOR_PYTHON_AGENT_MODE: "",
        CREATOR_MODEL_NAME: "mimo-v2.5-pro",
        CREATOR_MODEL_BASE_URL: modelBaseUrl,
        CREATOR_MODEL_API_KEY: "test-api-key",
      },
    });
    const proxyRoot = await createProxyServer(processManager);
    const response = await fetch(`${proxyRoot}/creator`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId: "domain-write-thread",
        runId: "domain-write-run",
        messages: [
          {
            role: "user",
            content: "Update the existing instance using semantic AppUIModel mutation.",
          },
        ],
      }),
    });
    const { events } = await readSseEvents(response);
    const toolStarts = events
      .filter((event) => event.type === "TOOL_CALL_START")
      .map((event) => event.toolCallName);

    expect(toolStarts).toEqual([
      "inspect_app_ui_model",
      "mutate_app_ui_model",
    ]);
    expect(toolStarts).not.toContain("edit_file");
    expect(await readFile(appUIModelPath, "utf8")).toContain(
      '"phase3B2NodePython": true',
    );
    expect(events.at(-1)?.result).toMatchObject({
      runtime: "python",
      agentMode: "domain-write",
      phase: "domain-write-agent",
      toolProtocol: { modelCalls: 3, toolCalls: 2, validToolCalls: 2 },
      projectControl: {
        requests: 2,
        byOperation: {
          inspect_app_ui_model: 1,
          mutate_app_ui_model: 1,
        },
      },
      appUIModelMutations: {
        requests: 1,
        operations: 1,
        hashConflicts: 0,
        changedPaths: 1,
        resultMismatches: 0,
      },
      receipt: {
        verification: { status: "not-run", projectRevision: 1 },
        transaction: { runId: "domain-write-run", undoable: true },
      },
    });
  }, 60_000);

  it("forwards runtime diagnostics through the production proxy", async () => {
    const processManager = manager();
    const proxyRoot = await createProxyServer(processManager);
    const golden = await fixture("runtime-diagnostics.json");
    const response = await fetch(`${proxyRoot}/runtime-diagnostics`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(golden.compositionEnvelope),
    });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ accepted: true });
  }, 30_000);

  it("restarts after a real Python crash", async () => {
    const processManager = manager();
    await processManager.ensureStarted();
    const firstPid = processManager.processId!;

    process.kill(firstPid);
    expect(await waitForProcessExit(firstPid)).toBe(true);
    const secondEndpoint = await processManager.ensureStarted();
    const secondPid = processManager.processId!;

    expect(secondPid).toBeGreaterThan(0);
    expect(secondPid).not.toBe(firstPid);
    const health = await fetch(
      `http://${secondEndpoint.host}:${secondEndpoint.port}/health`,
      { headers: { Authorization: `Bearer ${secondEndpoint.authToken}` } },
    );
    expect(health.status).toBe(200);
  }, 30_000);

  it("disposes idempotently and leaves no child process", async () => {
    const processManager = manager();
    await processManager.ensureStarted();
    const pid = processManager.processId!;

    await processManager.dispose();
    await processManager.dispose();
    expect(await waitForProcessExit(pid)).toBe(true);

    const neverStarted = manager();
    await neverStarted.dispose();
    await neverStarted.dispose();
  }, 30_000);

  it("reports a missing Python executable without retaining startup state", async () => {
    const processManager = manager({
      pythonExecutable: path.join(tmpdir(), "creator-python-does-not-exist"),
      startupTimeoutMs: 200,
      stopTimeoutMs: 200,
    });

    await expect(processManager.ensureStarted()).rejects.toMatchObject({
      code: "CREATOR_PYTHON_RUNTIME_MISSING",
    });
    await expect(processManager.ensureStarted()).rejects.toMatchObject({
      code: "CREATOR_PYTHON_RUNTIME_MISSING",
    });
    expect(processManager.processId).toBeUndefined();
  });

  it("rejects an incompatible handshake, terminates it, and can retry", async () => {
    const fixturePackage = await fakePythonPackage(`
import json, os, sys, time
open(os.environ["CREATOR_TEST_PID_FILE"], "w", encoding="utf-8").write(str(os.getpid()))
print("fixture stderr before handshake", file=sys.stderr, flush=True)
print(json.dumps({"type": "creator_ready", "port": 43123, "protocolVersion": "999"}), flush=True)
time.sleep(60)
`);
    const processManager = manager({
      pythonPackageRoot: fixturePackage.packageRoot,
      environment: {
        ...process.env,
        CREATOR_TEST_PID_FILE: fixturePackage.pidFile,
      },
      stopTimeoutMs: 1_000,
    });

    await expect(processManager.ensureStarted()).rejects.toMatchObject({
      code: "CREATOR_PYTHON_PROTOCOL_INCOMPATIBLE",
    });
    const pid = Number.parseInt(await readFile(fixturePackage.pidFile, "utf8"), 10);
    expect(await waitForProcessExit(pid)).toBe(true);
    expect(processManager.processId).toBeUndefined();

    await writeFile(
      path.join(fixturePackage.packageRoot, "agent_ui_creator", "server.py"),
      `
import argparse, json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
parser = argparse.ArgumentParser()
parser.add_argument("--auth-token", required=True)
arguments, _ = parser.parse_known_args()
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/health" or self.headers.get("Authorization") != "Bearer " + arguments.auth_token:
            self.send_response(401)
            self.end_headers()
            return
        body = json.dumps({"status": "ok", "runtime": "python", "agentMode": "domain-write", "protocolVersion": "1"}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, _format, *args):
        return
server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
print(json.dumps({"type": "creator_ready", "port": server.server_address[1], "protocolVersion": "1"}), flush=True)
server.serve_forever()
`,
    );
    const recovered = await processManager.ensureStarted();
    expect(recovered.protocolVersion).toBe(CREATOR_PYTHON_PROTOCOL_VERSION);
    expect(processManager.processId).toBeGreaterThan(0);
  }, 10_000);

  it("times out startup, terminates the fixture child, and clears state", async () => {
    const fixturePackage = await fakePythonPackage(`
import os, time
open(os.environ["CREATOR_TEST_PID_FILE"], "w", encoding="utf-8").write(str(os.getpid()))
time.sleep(60)
`);
    const processManager = manager({
      pythonPackageRoot: fixturePackage.packageRoot,
      environment: {
        ...process.env,
        CREATOR_TEST_PID_FILE: fixturePackage.pidFile,
      },
      startupTimeoutMs: 500,
      stopTimeoutMs: 1_000,
    });

    await expect(processManager.ensureStarted()).rejects.toMatchObject({
      code: "CREATOR_PYTHON_START_TIMEOUT",
    });
    const pid = Number.parseInt(await readFile(fixturePackage.pidFile, "utf8"), 10);
    expect(await waitForProcessExit(pid)).toBe(true);
    expect(processManager.processId).toBeUndefined();
  }, 10_000);
});
