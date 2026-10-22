import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import { readCreatorHostConfigValue } from "./creatorRuntimeConfig.js";
import { ensureManagedPythonEnvironment, validateCreatorPython } from "./python/managed-python-environment.js";
import { PythonCreatorRuntimeError } from "./python/runtime-error.js";
import { resolvePackagedSidecar } from "./python/packaged-sidecar.js";
import { creatorDistributionRoot } from "./creatorRuntimeDistribution.js";
export { PythonCreatorRuntimeError } from "./python/runtime-error.js";
import {
  CREATOR_PYTHON_AUTH_TOKEN_ENV,
  CREATOR_PYTHON_AGENT_MODES,
  CREATOR_PYTHON_ENDPOINT_ENV,
  CREATOR_PYTHON_HOT_RELOAD_ENV,
  type CreatorPythonAgentMode,
} from "./shared.js";

export const CREATOR_PYTHON_START_TIMEOUT_MS = 15_000;
export const CREATOR_PYTHON_STOP_TIMEOUT_MS = 3_000;
const CREATOR_PYTHON_HOT_RELOAD_POLL_INTERVAL_MS = 500;

export interface PythonCreatorEndpoint {
  host: "127.0.0.1";
  port: number;
  authToken: string;
  agentMode: CreatorPythonAgentMode;
}

export interface PythonCreatorProcessManagerOptions {
  projectRoot: string;
  allowExternalEndpoint?: boolean | undefined;
  configRoot?: string | undefined;
  skillsRoot?: string | undefined;
  pythonExecutable?: string | undefined;
  pythonPackageRoot?: string | undefined;
  environment?: NodeJS.ProcessEnv | undefined;
  startupTimeoutMs?: number | undefined;
  stopTimeoutMs?: number | undefined;
  log?: ((message: string) => void) | undefined;
}

export interface PythonCreatorExternalEndpoint {
  host: "127.0.0.1";
  port: number;
  authToken: string;
}

export type CreatorPythonExecutableSource =
  | "configured"
  | "managed_venv"
  | "packaged_venv"
  | "packaged_sidecar";

export interface ResolvedCreatorPythonExecutable {
  executable: string;
  source: CreatorPythonExecutableSource;
  pythonPackageRoot?: string | undefined;
}

export function resolveConfiguredCreatorPythonEndpoint({
  endpoint,
  authToken,
}: {
  endpoint?: string | undefined;
  authToken?: string | undefined;
}): PythonCreatorExternalEndpoint | undefined {
  const configuredEndpoint = endpoint?.trim();
  const configuredAuthToken = authToken?.trim();
  if (!configuredEndpoint && !configuredAuthToken) {
    return undefined;
  }
  if (!configuredEndpoint || !configuredAuthToken) {
    throw new PythonCreatorRuntimeError(
      "CREATOR_PYTHON_ENDPOINT_INVALID",
      `${CREATOR_PYTHON_ENDPOINT_ENV} and ${CREATOR_PYTHON_AUTH_TOKEN_ENV} must be configured together.`,
    );
  }
  if (configuredAuthToken.length < 32) {
    throw new PythonCreatorRuntimeError(
      "CREATOR_PYTHON_ENDPOINT_INVALID",
      `${CREATOR_PYTHON_AUTH_TOKEN_ENV} must contain at least 32 characters.`,
    );
  }

  let url: URL;
  try {
    url = new URL(configuredEndpoint);
  } catch {
    throw new PythonCreatorRuntimeError(
      "CREATOR_PYTHON_ENDPOINT_INVALID",
      `${CREATOR_PYTHON_ENDPOINT_ENV} must be a valid URL.`,
    );
  }
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    url.port === "" ||
    url.username !== "" ||
    url.password !== "" ||
    (url.pathname !== "" && url.pathname !== "/") ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new PythonCreatorRuntimeError(
      "CREATOR_PYTHON_ENDPOINT_INVALID",
      `${CREATOR_PYTHON_ENDPOINT_ENV} must be an http://127.0.0.1:<port> origin.`,
    );
  }
  const port = Number(url.port);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new PythonCreatorRuntimeError(
      "CREATOR_PYTHON_ENDPOINT_INVALID",
      `${CREATOR_PYTHON_ENDPOINT_ENV} must include a valid port.`,
    );
  }
  return { host: "127.0.0.1", port, authToken: configuredAuthToken };
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
  environment = process.env,
}: {
  configuredExecutable?: string | undefined;
  pythonPackageRoot?: string | undefined;
  platform?: NodeJS.Platform | undefined;
  environment?: NodeJS.ProcessEnv | undefined;
}): Promise<ResolvedCreatorPythonExecutable> {
  const configured = configuredExecutable?.trim();
  if (configured) {
    return { executable: configured, source: "configured" };
  }
  if (pythonPackageRoot === undefined) {
    return { ...await resolvePackagedSidecar({ platform }), source: "packaged_sidecar" };
  }
  const managedExecutable = path.join(
    pythonPackageRoot,
    ".venv",
    platform === "win32" ? "Scripts" : "bin",
    platform === "win32" ? "python.exe" : "python",
  );
  try {
    // A .venv is trusted only in the monorepo source package, never node_modules.
    if (path.basename(pythonPackageRoot) !== "python" || path.basename(path.dirname(pythonPackageRoot)) !== "creator" || path.basename(path.dirname(path.dirname(pythonPackageRoot))) !== "packages") throw new Error("Not a source checkout.");
    await access(path.resolve(pythonPackageRoot, "../../../pnpm-workspace.yaml"));
    await access(managedExecutable);
    return { executable: managedExecutable, source: "managed_venv" };
  } catch {
    // Only repository development may bootstrap a Python environment.
    // Installed Creator never looks for system Python or runs pip.
    const sourceCheckout = path.basename(pythonPackageRoot) === "python" &&
      path.basename(path.dirname(pythonPackageRoot)) === "creator" &&
      path.basename(path.dirname(path.dirname(pythonPackageRoot))) === "packages" &&
      existsSync(path.resolve(pythonPackageRoot, "../../../pnpm-workspace.yaml"));
    if (sourceCheckout) return { executable: await ensureManagedPythonEnvironment({ pythonPackageRoot, platform, environment }), source: "packaged_venv" };
    return { ...await resolvePackagedSidecar({ platform }), source: "packaged_sidecar" };
  }
}

interface CreatorReadyHandshake {
  type: "creator_ready";
  port: number;
}

function defaultPythonPackageRoot(): string | undefined {
  const workspacePackageRoot = path.join(creatorDistributionRoot(), "python");
  return existsSync(path.join(workspacePackageRoot, "pyproject.toml"))
    ? workspacePackageRoot
    : undefined;
}

function defaultSkillsRoot(): string {
  return path.join(creatorDistributionRoot(), "skills");
}

function isEnabled(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

function isChildRunning(child: ChildProcess | undefined): boolean {
  if (child?.pid === undefined || child.exitCode !== null || child.signalCode !== null) return false;
  // Windows can report a terminated PID before Node delivers the child's exit event.
  try { process.kill(child.pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
}

async function pythonSourceFingerprint(root: string): Promise<string> {
  const files: string[] = [];

  async function visit(directory: string, relativeDirectory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.name === "__pycache__") {
        continue;
      }
      const relativePath = path.join(relativeDirectory, entry.name);
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath, relativePath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".py")) {
        continue;
      }
      const metadata = await stat(absolutePath);
      files.push(`${relativePath}:${metadata.mtimeMs}:${metadata.size}`);
    }
  }

  await visit(root, "");
  return files.join("\n");
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
    Object.keys(handshake).sort().join(",") !== "port,type" ||
    handshake.type !== "creator_ready" ||
    typeof handshake.port !== "number" ||
    !Number.isInteger(handshake.port) ||
    handshake.port < 1 ||
    handshake.port > 65_535
  ) {
    throw new PythonCreatorRuntimeError(
      "CREATOR_PYTHON_PROTOCOL_INCOMPATIBLE",
      "Creator Python handshake does not match the current contract.",
      { handshake },
    );
  }
  return {
    type: "creator_ready",
    port: handshake.port,
  };
}

export class PythonCreatorProcessManager {
  readonly #projectRoot: string;
  readonly #configRoot: string | undefined;
  readonly #skillsRoot: string;
  readonly #configuredPythonExecutable: string | undefined;
  readonly #pythonPackageRoot: string | undefined;
  readonly #environment: NodeJS.ProcessEnv;
  readonly #startupTimeoutMs: number;
  readonly #stopTimeoutMs: number;
  readonly #log: (message: string) => void;
  readonly #externalEndpoint: PythonCreatorExternalEndpoint | undefined;
  readonly #hotReloadEnabled: boolean;

  #child: ChildProcess | undefined;
  readonly #closedChildren = new WeakSet<ChildProcess>();
  #endpoint: PythonCreatorEndpoint | undefined;
  #starting: Promise<PythonCreatorEndpoint> | undefined;
  #hotReloadTimer: NodeJS.Timeout | undefined;
  #hotReloadScan: Promise<void> | undefined;
  #hotReloadRestart: Promise<void> | undefined;
  #hotReloadFingerprint: string | undefined;
  #disposed = false;

  constructor({
    projectRoot,
    allowExternalEndpoint = true,
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
    const configuredHotReload =
      environment[CREATOR_PYTHON_HOT_RELOAD_ENV]?.trim() ||
      readCreatorHostConfigValue(configRoot, CREATOR_PYTHON_HOT_RELOAD_ENV);
    this.#hotReloadEnabled = isEnabled(configuredHotReload);
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
    this.#pythonPackageRoot = pythonPackageRoot === undefined ? undefined : path.resolve(pythonPackageRoot);
    this.#environment = environment;
    this.#externalEndpoint = allowExternalEndpoint ? resolveConfiguredCreatorPythonEndpoint({
      endpoint:
        environment[CREATOR_PYTHON_ENDPOINT_ENV]?.trim() ||
        readCreatorHostConfigValue(this.#configRoot, CREATOR_PYTHON_ENDPOINT_ENV),
      authToken:
        environment[CREATOR_PYTHON_AUTH_TOKEN_ENV]?.trim() ||
        readCreatorHostConfigValue(
          this.#configRoot,
          CREATOR_PYTHON_AUTH_TOKEN_ENV,
        ),
    }) : undefined;
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
    if (this.#hotReloadRestart !== undefined) {
      await this.#hotReloadRestart;
      if (this.#disposed) {
        throw new PythonCreatorRuntimeError(
          "CREATOR_PYTHON_RUNTIME_DISPOSED",
          "Creator Python runtime manager has already been disposed.",
        );
      }
    }
    if (
      this.#endpoint !== undefined &&
      (this.#externalEndpoint !== undefined || isChildRunning(this.#child))
    ) {
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
    if (this.#hotReloadTimer !== undefined) {
      clearInterval(this.#hotReloadTimer);
      this.#hotReloadTimer = undefined;
    }
    const child = this.#child;
    this.#child = undefined;
    this.#endpoint = undefined;
    if (child !== undefined) {
      await this.#terminateChild(child);
    }
    await this.#hotReloadRestart;
  }

  async #start(): Promise<PythonCreatorEndpoint> {
    if (this.#externalEndpoint !== undefined) {
      const endpoint = {
        ...this.#externalEndpoint,
      };
      const agentMode = await this.#waitForHealth(endpoint);
      const readyEndpoint = { ...endpoint, agentMode };
      this.#endpoint = readyEndpoint;
      this.#log(
        `python sidecar attached host=${readyEndpoint.host} port=${readyEndpoint.port} agentMode=${agentMode}`,
      );
      return readyEndpoint;
    }

    const pythonRuntime = await resolveCreatorPythonExecutable({
      configuredExecutable: this.#configuredPythonExecutable,
      pythonPackageRoot: this.#pythonPackageRoot,
      environment: {
        ...this.#environment,
        CREATOR_PYTHON_ENV_ROOT: this.#environment.CREATOR_PYTHON_ENV_ROOT ?? readCreatorHostConfigValue(this.#configRoot, "CREATOR_PYTHON_ENV_ROOT"),
      },
    });
    // An explicit interpreter override still uses the installed platform package's
    // Agent source; it does not create a second distribution in Creator.
    const packagePath = pythonRuntime.pythonPackageRoot ?? (this.#pythonPackageRoot !== undefined && existsSync(path.join(this.#pythonPackageRoot, "agent_ui_creator/server.py"))
      ? this.#pythonPackageRoot : (await resolvePackagedSidecar()).pythonPackageRoot);
    const serverModule = path.join(
      packagePath,
      "agent_ui_creator",
      "server.py",
    );
    try {
      await Promise.all([
        access(serverModule),
        access(this.#skillsRoot),
        readFile(path.join(packagePath, "pyproject.toml"), "utf8"),
      ]);
    } catch (error) {
      throw new PythonCreatorRuntimeError(
        "CREATOR_PYTHON_RUNTIME_MISSING",
        `Creator Python runtime resources are unavailable at ${packagePath}. Reinstall Creator and its matching platform package, or check the configured source checkout.`,
        { cause: error instanceof Error ? error.message : String(error) },
      );
    }

    if (pythonRuntime.source !== "packaged_venv") {
      await validateCreatorPython(pythonRuntime.executable, {
        pythonPackageRoot: packagePath,
        environment: this.#environment,
      });
    }
    this.#log(
      `python runtime: source=${pythonRuntime.source} executable=${pythonRuntime.executable}`,
    );

    if (this.#disposed) {
      throw new PythonCreatorRuntimeError(
        "CREATOR_PYTHON_RUNTIME_DISPOSED",
        "Creator Python runtime manager has already been disposed.",
      );
    }

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
    const packaged = pythonRuntime.source === "packaged_sidecar";
    const existingPythonPath = this.#environment.PYTHONPATH?.trim();
    const child = spawn(pythonRuntime.executable, args, {
      cwd: this.#projectRoot,
      env: {
        ...this.#environment,
        CREATOR_NODE_EXECUTABLE: process.execPath,
        ...(pythonRuntime.source === "packaged_venv" || packaged ? { PYTHONHOME: undefined, VIRTUAL_ENV: undefined, PYTHONNOUSERSITE: "1", PYTHONDONTWRITEBYTECODE: "1" } : {}),
        PYTHONIOENCODING: "utf-8",
        PYTHONUNBUFFERED: "1",
        PYTHONDONTWRITEBYTECODE: "1",
        PYTHONPATH:
          packaged || existingPythonPath === undefined || existingPythonPath === ""
            ? packagePath
            : `${packagePath}${path.delimiter}${existingPythonPath}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.#child = child;
    // `exit` can precede stdio handle closure on Windows. Track `close` so
    // callers that clean temporary packages wait until Node releases the pipes.
    child.once("close", () => this.#closedChildren.add(child));
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
      const endpoint: Omit<PythonCreatorEndpoint, "agentMode"> = {
        host: "127.0.0.1",
        port: handshake.port,
        authToken,
      };
      const agentMode = await this.#waitForHealth(endpoint);
      if (child.exitCode !== null) {
        throw new PythonCreatorRuntimeError(
          "CREATOR_PYTHON_START_FAILED",
          `Creator Python runtime exited during startup with code ${child.exitCode}.`,
        );
      }
      const readyEndpoint = { ...endpoint, agentMode };
      this.#endpoint = readyEndpoint;
      await this.#ensureHotReloadWatcher();
      this.#log(
        `python sidecar ready pid=${String(child.pid)} port=${readyEndpoint.port} pythonSource=${pythonRuntime.source} agentMode=${agentMode}`,
      );
      return readyEndpoint;
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
          `Python executable "${pythonRuntime.executable}" is unavailable. Reinstall Creator and its matching platform package, or check an explicitly configured Python executable. Repository developers can run pnpm test:python:setup.`,
        );
      }
      throw new PythonCreatorRuntimeError(
        "CREATOR_PYTHON_START_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async #ensureHotReloadWatcher(): Promise<void> {
    if (
      !this.#hotReloadEnabled ||
      this.#pythonPackageRoot === undefined ||
      this.#externalEndpoint !== undefined ||
      this.#hotReloadTimer !== undefined ||
      this.#disposed
    ) {
      return;
    }

    const sourceRoot = path.join(this.#pythonPackageRoot, "agent_ui_creator");
    try {
      this.#hotReloadFingerprint = await pythonSourceFingerprint(sourceRoot);
    } catch (error) {
      this.#log(
        `python hot reload unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }

    this.#hotReloadTimer = setInterval(() => {
      void this.#pollHotReload(sourceRoot);
    }, CREATOR_PYTHON_HOT_RELOAD_POLL_INTERVAL_MS);
    this.#hotReloadTimer.unref?.();
    this.#log(`python hot reload enabled root=${sourceRoot}`);
  }

  async #pollHotReload(sourceRoot: string): Promise<void> {
    if (
      this.#disposed ||
      this.#hotReloadScan !== undefined ||
      this.#hotReloadTimer === undefined
    ) {
      return;
    }
    const scan = (async () => {
      const fingerprint = await pythonSourceFingerprint(sourceRoot);
      if (this.#hotReloadFingerprint === undefined) {
        this.#hotReloadFingerprint = fingerprint;
        return;
      }
      if (fingerprint === this.#hotReloadFingerprint) {
        return;
      }
      this.#hotReloadFingerprint = fingerprint;
      this.#scheduleHotReloadRestart();
    })();
    this.#hotReloadScan = scan;
    try {
      await scan;
    } catch (error) {
      this.#log(
        `python hot reload scan failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      if (this.#hotReloadScan === scan) {
        this.#hotReloadScan = undefined;
      }
    }
  }

  #scheduleHotReloadRestart(): void {
    if (this.#hotReloadRestart !== undefined) {
      return;
    }
    const restart = this.#restartForHotReload();
    this.#hotReloadRestart = restart;
    void restart.then(
      () => {
        if (this.#hotReloadRestart === restart) {
          this.#hotReloadRestart = undefined;
        }
      },
      (error) => {
        this.#log(
          `python hot reload restart failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        if (this.#hotReloadRestart === restart) {
          this.#hotReloadRestart = undefined;
        }
      },
    );
  }

  async #restartForHotReload(): Promise<void> {
    if (this.#disposed || this.#externalEndpoint !== undefined) {
      return;
    }
    const child = this.#child;
    if (child === undefined) {
      return;
    }
    this.#child = undefined;
    this.#endpoint = undefined;
    this.#log("python source changed; restarting sidecar");
    await this.#terminateChild(child);
    if (this.#disposed) {
      return;
    }
    try {
      await this.#start();
    } catch (error) {
      this.#log(
        `python hot reload restart failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async #terminateChild(child: ChildProcess): Promise<void> {
    if (child.pid === undefined) return;
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    if (await this.#waitForChildClose(child, this.#stopTimeoutMs)) {
      return;
    }
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await this.#waitForChildClose(child, this.#stopTimeoutMs);
    }
  }

  #waitForChildClose(child: ChildProcess, timeoutMs: number): Promise<boolean> {
    if (this.#closedChildren.has(child)) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        cleanup();
        resolve(false);
      }, timeoutMs);
      const cleanup = (): void => {
        clearTimeout(timeout);
        child.removeListener("close", onClose);
      };
      const onClose = (): void => {
        this.#closedChildren.add(child);
        cleanup();
        resolve(true);
      };
      child.once("close", onClose);
      if (this.#closedChildren.has(child)) {
        cleanup();
        resolve(true);
      }
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
              ? "CREATOR_PYTHON_ENVIRONMENT_INVALID"
              : "CREATOR_PYTHON_START_FAILED",
            dependencyMissing
              ? "Creator Python runtime dependencies are unavailable. Reinstall Creator and its matching platform package. If CREATOR_PYTHON_EXECUTABLE is explicitly configured, provide a complete environment or unset it to use the bundled platform runtime."
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

  async #waitForHealth(
    endpoint: Omit<PythonCreatorEndpoint, "agentMode">,
  ): Promise<CreatorPythonAgentMode> {
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
            Object.keys(body).every((key) => ["status", "runtime", "agentMode", "projectRoot", "verificationMode", "phase"].includes(key)) &&
            body.status === "ok" &&
            body.runtime === "python" &&
            typeof body.agentMode === "string" &&
            (CREATOR_PYTHON_AGENT_MODES as readonly string[]).includes(
              body.agentMode,
            )
          ) {
            return body.agentMode as CreatorPythonAgentMode;
          }
          throw new PythonCreatorRuntimeError(
            "CREATOR_PYTHON_PROTOCOL_MISMATCH",
            "Creator Python health response does not identify a supported python runtime and agent mode.",
            { health: body },
          );
        }
      } catch (error) {
        if (error instanceof PythonCreatorRuntimeError) {
          throw error;
        }
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
