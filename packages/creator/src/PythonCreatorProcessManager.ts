import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import { readCreatorHostConfigValue } from "./creatorRuntimeConfig.js";

export const CREATOR_PYTHON_PROTOCOL_VERSION = "1" as const;
export const CREATOR_PYTHON_START_TIMEOUT_MS = 15_000;
export const CREATOR_PYTHON_STOP_TIMEOUT_MS = 3_000;

export interface PythonCreatorEndpoint {
  host: "127.0.0.1";
  port: number;
  authToken: string;
  protocolVersion: typeof CREATOR_PYTHON_PROTOCOL_VERSION;
}

export interface PythonCreatorProcessManagerOptions {
  projectRoot: string;
  configRoot?: string | undefined;
  skillsRoot?: string | undefined;
  pythonExecutable?: string | undefined;
  pythonPackageRoot?: string | undefined;
  environment?: NodeJS.ProcessEnv | undefined;
  startupTimeoutMs?: number | undefined;
  stopTimeoutMs?: number | undefined;
  log?: ((message: string) => void) | undefined;
}

export type CreatorPythonExecutableSource =
  | "configured"
  | "managed_venv"
  | "system";

export interface ResolvedCreatorPythonExecutable {
  executable: string;
  source: CreatorPythonExecutableSource;
}

export function resolveConfiguredCreatorPythonExecutable({
  optionExecutable,
  environmentExecutable,
  hostConfigExecutable,
}: {
  optionExecutable?: string | undefined;
  environmentExecutable?: string | undefined;
  hostConfigExecutable?: string | undefined;
}): string | undefined {
  return (
    optionExecutable?.trim() ||
    environmentExecutable?.trim() ||
    hostConfigExecutable?.trim() ||
    undefined
  );
}

export async function resolveCreatorPythonExecutable({
  configuredExecutable,
  pythonPackageRoot,
  platform = process.platform,
}: {
  configuredExecutable?: string | undefined;
  pythonPackageRoot: string;
  platform?: NodeJS.Platform | undefined;
}): Promise<ResolvedCreatorPythonExecutable> {
  const configured = configuredExecutable?.trim();
  if (configured) {
    return { executable: configured, source: "configured" };
  }
  const managedExecutable = path.join(
    pythonPackageRoot,
    ".venv",
    platform === "win32" ? "Scripts" : "bin",
    platform === "win32" ? "python.exe" : "python",
  );
  try {
    await access(managedExecutable);
    return { executable: managedExecutable, source: "managed_venv" };
  } catch {
    return {
      executable: platform === "win32" ? "python" : "python3",
      source: "system",
    };
  }
}

export class PythonCreatorRuntimeError extends Error {
  readonly code: string;
  readonly details: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "PythonCreatorRuntimeError";
    this.code = code;
    this.details = details;
  }
}

interface CreatorReadyHandshake {
  type: "creator_ready";
  port: number;
  protocolVersion: typeof CREATOR_PYTHON_PROTOCOL_VERSION;
}

function defaultPythonPackageRoot(): string {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../creator-python",
  );
}

function defaultSkillsRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../skills");
}

function parseHandshake(source: string): CreatorReadyHandshake {
  let value: unknown;
  try {
    value = JSON.parse(source) as unknown;
  } catch {
    throw new PythonCreatorRuntimeError(
      "CREATOR_PYTHON_HANDSHAKE_INVALID",
      "Creator Python runtime did not emit a valid startup handshake.",
      { output: source.slice(0, 1_000) },
    );
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PythonCreatorRuntimeError(
      "CREATOR_PYTHON_HANDSHAKE_INVALID",
      "Creator Python runtime emitted an invalid startup handshake.",
    );
  }
  const handshake = value as Record<string, unknown>;
  if (
    handshake.type !== "creator_ready" ||
    typeof handshake.port !== "number" ||
    !Number.isInteger(handshake.port) ||
    handshake.port < 1 ||
    handshake.port > 65_535 ||
    handshake.protocolVersion !== CREATOR_PYTHON_PROTOCOL_VERSION
  ) {
    throw new PythonCreatorRuntimeError(
      "CREATOR_PYTHON_PROTOCOL_INCOMPATIBLE",
      `Creator Python runtime must use protocol version ${CREATOR_PYTHON_PROTOCOL_VERSION}.`,
      { handshake },
    );
  }
  return {
    type: "creator_ready",
    port: handshake.port,
    protocolVersion: CREATOR_PYTHON_PROTOCOL_VERSION,
  };
}

export class PythonCreatorProcessManager {
  readonly #projectRoot: string;
  readonly #configRoot: string | undefined;
  readonly #skillsRoot: string;
  readonly #configuredPythonExecutable: string | undefined;
  readonly #pythonPackageRoot: string;
  readonly #environment: NodeJS.ProcessEnv;
  readonly #startupTimeoutMs: number;
  readonly #stopTimeoutMs: number;
  readonly #log: (message: string) => void;

  #child: ChildProcess | undefined;
  #endpoint: PythonCreatorEndpoint | undefined;
  #starting: Promise<PythonCreatorEndpoint> | undefined;
  #disposed = false;

  constructor({
    projectRoot,
    configRoot,
    skillsRoot = defaultSkillsRoot(),
    pythonExecutable,
    pythonPackageRoot = defaultPythonPackageRoot(),
    environment = process.env,
    startupTimeoutMs = CREATOR_PYTHON_START_TIMEOUT_MS,
    stopTimeoutMs = CREATOR_PYTHON_STOP_TIMEOUT_MS,
    log = (message) => console.error(`[agent-ui-creator-python] ${message}`),
  }: PythonCreatorProcessManagerOptions) {
    this.#projectRoot = path.resolve(projectRoot);
    this.#configRoot =
      configRoot === undefined ? undefined : path.resolve(configRoot);
    this.#skillsRoot = path.resolve(skillsRoot);
    const directlyConfiguredExecutable = resolveConfiguredCreatorPythonExecutable({
      optionExecutable: pythonExecutable,
      environmentExecutable: environment.CREATOR_PYTHON_EXECUTABLE,
    });
    this.#configuredPythonExecutable =
      directlyConfiguredExecutable ??
      resolveConfiguredCreatorPythonExecutable({
        hostConfigExecutable: readCreatorHostConfigValue(
          this.#configRoot,
          "CREATOR_PYTHON_EXECUTABLE",
        ),
      });
    this.#pythonPackageRoot = path.resolve(pythonPackageRoot);
    this.#environment = environment;
    this.#startupTimeoutMs = startupTimeoutMs;
    this.#stopTimeoutMs = stopTimeoutMs;
    this.#log = log;
  }

  get processId(): number | undefined {
    return this.#child?.pid;
  }

  async ensureStarted(): Promise<PythonCreatorEndpoint> {
    if (this.#disposed) {
      throw new PythonCreatorRuntimeError(
        "CREATOR_PYTHON_RUNTIME_DISPOSED",
        "Creator Python runtime manager has already been disposed.",
      );
    }
    if (this.#endpoint !== undefined && this.#child?.exitCode === null) {
      return this.#endpoint;
    }
    if (this.#starting !== undefined) {
      return this.#starting;
    }
    this.#starting = this.#start();
    try {
      return await this.#starting;
    } finally {
      this.#starting = undefined;
    }
  }

  async dispose(): Promise<void> {
    this.#disposed = true;
    const child = this.#child;
    this.#child = undefined;
    this.#endpoint = undefined;
    if (child === undefined) {
      return;
    }
    await this.#terminateChild(child);
  }

  async #start(): Promise<PythonCreatorEndpoint> {
    const serverModule = path.join(
      this.#pythonPackageRoot,
      "agent_ui_creator",
      "server.py",
    );
    try {
      await Promise.all([
        access(serverModule),
        access(this.#skillsRoot),
        readFile(path.join(this.#pythonPackageRoot, "pyproject.toml"), "utf8"),
      ]);
    } catch (error) {
      throw new PythonCreatorRuntimeError(
        "CREATOR_PYTHON_RUNTIME_MISSING",
        `Creator Python package is unavailable at ${this.#pythonPackageRoot}. Install the packages/creator-python environment before selecting the Python runtime.`,
        { cause: error instanceof Error ? error.message : String(error) },
      );
    }

    const pythonRuntime = await resolveCreatorPythonExecutable({
      configuredExecutable: this.#configuredPythonExecutable,
      pythonPackageRoot: this.#pythonPackageRoot,
    });
    this.#log(
      `python runtime: source=${pythonRuntime.source} executable=${pythonRuntime.executable}`,
    );

    const authToken = randomBytes(32).toString("hex");
    const args = [
      "-m",
      "agent_ui_creator.server",
      "--project-root",
      this.#projectRoot,
      "--port",
      "0",
      "--auth-token",
      authToken,
      "--parent-pid",
      String(process.pid),
      "--skills-root",
      this.#skillsRoot,
      ...(this.#configRoot === undefined
        ? []
        : ["--config-root", this.#configRoot]),
    ];
    const packagePath = this.#pythonPackageRoot;
    const existingPythonPath = this.#environment.PYTHONPATH?.trim();
    const child = spawn(pythonRuntime.executable, args, {
      cwd: this.#projectRoot,
      env: {
        ...this.#environment,
        PYTHONIOENCODING: "utf-8",
        PYTHONUNBUFFERED: "1",
        PYTHONPATH:
          existingPythonPath === undefined || existingPythonPath === ""
            ? packagePath
            : `${packagePath}${path.delimiter}${existingPythonPath}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.#child = child;
    let startupStderr = "";
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      startupStderr = `${startupStderr}${chunk}`.slice(-8_000);
      const message = chunk.trimEnd();
      if (message !== "") {
        this.#log(message);
      }
    });
    child.once("exit", (code, signal) => {
      if (this.#child === child) {
        this.#child = undefined;
        this.#endpoint = undefined;
      }
      if (!this.#disposed && code !== 0) {
        this.#log(
          `runtime exited unexpectedly (code=${String(code)}, signal=${String(signal)}); it will restart on the next request.`,
        );
      }
    });

    try {
      const handshake = await this.#waitForHandshake(
        child,
        () => startupStderr,
      );
      child.stdout?.setEncoding("utf8");
      child.stdout?.on("data", (chunk: string) => {
        const message = chunk.trimEnd();
        if (message !== "") {
          this.#log(`unexpected stdout: ${message}`);
        }
      });
      const endpoint: PythonCreatorEndpoint = {
        host: "127.0.0.1",
        port: handshake.port,
        authToken,
        protocolVersion: handshake.protocolVersion,
      };
      await this.#waitForHealth(endpoint);
      if (child.exitCode !== null) {
        throw new PythonCreatorRuntimeError(
          "CREATOR_PYTHON_START_FAILED",
          `Creator Python runtime exited during startup with code ${child.exitCode}.`,
        );
      }
      this.#endpoint = endpoint;
      return endpoint;
    } catch (error) {
      if (this.#child === child) {
        this.#child = undefined;
        this.#endpoint = undefined;
      }
      await this.#terminateChild(child);
      if (error instanceof PythonCreatorRuntimeError) {
        throw error;
      }
      const systemError = error as NodeJS.ErrnoException;
      if (systemError.code === "ENOENT") {
        throw new PythonCreatorRuntimeError(
          "CREATOR_PYTHON_RUNTIME_MISSING",
          `Python executable "${pythonRuntime.executable}" is unavailable. Run \`pnpm test:python:setup\` to create the managed packages/creator-python/.venv environment, or configure CREATOR_PYTHON_EXECUTABLE explicitly with a Python 3.11+ environment containing agent-ui-creator-core dependencies.`,
        );
      }
      throw new PythonCreatorRuntimeError(
        "CREATOR_PYTHON_START_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async #terminateChild(child: ChildProcess): Promise<void> {
    if (
      child.pid === undefined ||
      child.exitCode !== null ||
      child.signalCode !== null
    ) {
      return;
    }
    child.kill("SIGTERM");
    if (await this.#waitForChildExit(child, this.#stopTimeoutMs)) {
      return;
    }
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await this.#waitForChildExit(child, this.#stopTimeoutMs);
    }
  }

  #waitForChildExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
    if (child.exitCode !== null || child.signalCode !== null) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        cleanup();
        resolve(false);
      }, timeoutMs);
      const cleanup = (): void => {
        clearTimeout(timeout);
        child.removeListener("exit", onExit);
      };
      const onExit = (): void => {
        cleanup();
        resolve(true);
      };
      child.once("exit", onExit);
    });
  }

  #waitForHandshake(
    child: ChildProcess,
    startupStderr: () => string,
  ): Promise<CreatorReadyHandshake> {
    return new Promise((resolve, reject) => {
      const stdout = child.stdout;
      if (stdout === null) {
        reject(
          new PythonCreatorRuntimeError(
            "CREATOR_PYTHON_START_FAILED",
            "Creator Python runtime stdout is unavailable.",
          ),
        );
        return;
      }
      const lines = createInterface({ input: stdout });
      const timeout = setTimeout(() => {
        cleanup();
        reject(
          new PythonCreatorRuntimeError(
            "CREATOR_PYTHON_START_TIMEOUT",
            `Creator Python runtime did not become ready within ${this.#startupTimeoutMs}ms.`,
          ),
        );
      }, this.#startupTimeoutMs);
      const cleanup = (): void => {
        clearTimeout(timeout);
        lines.removeAllListeners();
        lines.close();
        child.removeListener("error", onError);
        child.removeListener("exit", onExit);
      };
      const onError = (error: Error): void => {
        cleanup();
        reject(error);
      };
      const onExit = (code: number | null): void => {
        cleanup();
        const stderr = startupStderr();
        const dependencyMissing =
          /(?:CREATOR_PYTHON_RUNTIME_MISSING|ModuleNotFoundError|No module named)/u.test(
            stderr,
          );
        reject(
          new PythonCreatorRuntimeError(
            dependencyMissing
              ? "CREATOR_PYTHON_RUNTIME_MISSING"
              : "CREATOR_PYTHON_START_FAILED",
            dependencyMissing
              ? "Creator Python dependency environment is incomplete. Install packages/creator-python/requirements.lock into the configured Python 3.11+ environment."
              : `Creator Python runtime exited before its handshake (code ${String(code)}).`,
            { stderr },
          ),
        );
      };
      child.once("error", onError);
      child.once("exit", onExit);
      lines.once("line", (line) => {
        cleanup();
        try {
          resolve(parseHandshake(line));
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  async #waitForHealth(endpoint: PythonCreatorEndpoint): Promise<void> {
    const deadline = Date.now() + this.#startupTimeoutMs;
    let lastError: unknown;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(
          `http://${endpoint.host}:${endpoint.port}/health`,
          {
            headers: { Authorization: `Bearer ${endpoint.authToken}` },
            signal: AbortSignal.timeout(1_000),
          },
        );
        if (response.ok) {
          const body = (await response.json()) as Record<string, unknown>;
          if (
            body.status === "ok" &&
            body.protocolVersion === CREATOR_PYTHON_PROTOCOL_VERSION
          ) {
            return;
          }
        }
      } catch (error) {
        lastError = error;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }
    throw new PythonCreatorRuntimeError(
      "CREATOR_PYTHON_HEALTH_TIMEOUT",
      "Creator Python runtime handshake completed, but its health endpoint did not become ready.",
      {
        cause: lastError instanceof Error ? lastError.message : String(lastError),
      },
    );
  }
}
