import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

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
  const instance = new PythonCreatorProcessManager({
    projectRoot,
    pythonPackageRoot,
    pythonExecutable,
    skillsRoot,
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
        "import sys, fastapi, httpx, pydantic, uvicorn; assert sys.version_info >= (3, 11)",
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

  it("streams the exact Unicode AG-UI lifecycle through the production proxy", async () => {
    const processManager = manager();
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
        body = json.dumps({"status": "ok", "protocolVersion": "1"}).encode("utf-8")
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
