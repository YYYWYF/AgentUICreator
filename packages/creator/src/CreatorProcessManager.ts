import { terminateProcessTree } from "./processTree.js";
import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { access, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { creatorDistributionRoot } from "./creatorRuntimeDistribution.js";
import { readCreatorHostConfigValue } from "./creatorRuntimeConfig.js";
import type { CreatorAgentMode } from "./shared.js";
export const CREATOR_START_TIMEOUT_MS = 15_000;
export const CREATOR_STOP_TIMEOUT_MS = 3_000;
export class CreatorRuntimeError extends Error {
  constructor(readonly code: string, message: string, readonly details?: unknown) { super(message); this.name = "CreatorRuntimeError"; }
}
export interface CreatorExternalEndpoint { host: "127.0.0.1"; port: number; authToken: string }
export interface CreatorEndpoint extends CreatorExternalEndpoint { agentMode: CreatorAgentMode }
export interface CreatorProcessManagerOptions {
  projectRoot: string; configRoot?: string | undefined; skillsRoot?: string | undefined;
  allowExternalEndpoint?: boolean | undefined; environment?: NodeJS.ProcessEnv | undefined;
  startupTimeoutMs?: number | undefined; stopTimeoutMs?: number | undefined; log?: ((message: string) => void) | undefined;
}
export function resolveConfiguredCreatorEndpoint({ endpoint, authToken }: { endpoint?: string | undefined; authToken?: string | undefined }): CreatorExternalEndpoint | undefined {
  if (!endpoint?.trim() && !authToken?.trim()) return undefined;
  if (!endpoint || !authToken || authToken.length < 32) throw new CreatorRuntimeError("CREATOR_ENDPOINT_INVALID", "A local endpoint and authentication token are required together.");
  const url = new URL(endpoint);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.username || url.password || url.search || url.hash || url.pathname !== "/" || !url.port) throw new CreatorRuntimeError("CREATOR_ENDPOINT_INVALID", "Creator endpoint must be a local HTTP origin.");
  return { host: "127.0.0.1", port: Number(url.port), authToken };
}
export class CreatorProcessManager {
  #child: ChildProcess | undefined;
  #endpoint: CreatorEndpoint | undefined;
  #starting: Promise<CreatorEndpoint> | undefined;
  #disposed = false;
  #watcher: ReturnType<typeof setInterval> | undefined;
  #fingerprint: string | undefined;
  #scanning = false;
  #restarting: Promise<void> | undefined;
  readonly #root: string;
  readonly #options: CreatorProcessManagerOptions;
  constructor(options: CreatorProcessManagerOptions) { this.#options = options; this.#root = path.resolve(options.projectRoot); }
  get processId() { return this.#child?.pid; }
  async isBusy(): Promise<boolean> {
    const endpoint = await this.ensureStarted();
    const response = await fetch(`http://${endpoint.host}:${endpoint.port}/health`, {
      headers: { Authorization: `Bearer ${endpoint.authToken}` }, signal: AbortSignal.timeout(5000),
    });
    const health = await response.json() as { busy?: boolean };
    if (!response.ok || typeof health.busy !== "boolean") throw new CreatorRuntimeError("CREATOR_HEALTH_INVALID", "Creator runtime health is unavailable.");
    return health.busy;
  }
  async ensureStarted(): Promise<CreatorEndpoint> {
    if (this.#disposed) throw new CreatorRuntimeError("CREATOR_RUNTIME_DISPOSED", "Creator runtime was disposed.");
    if (this.#restarting) await this.#restarting;
    if (this.#endpoint) return this.#endpoint;
    if (this.#starting) return this.#starting;
    this.#starting = this.#start();
    try { return await this.#starting; } finally { this.#starting = undefined; }
  }
  async #start(): Promise<CreatorEndpoint> {
    const options = this.#options, environment = options.environment ?? process.env;
    if (options.allowExternalEndpoint) {
      const get = (name: string) => environment[name] || readCreatorHostConfigValue(options.configRoot, name);
      const external = resolveConfiguredCreatorEndpoint({ endpoint: get("CREATOR_ENDPOINT"), authToken: get("CREATOR_AUTH_TOKEN") });
      if (external) return this.#checkHealth(external);
    }
    const distribution = creatorDistributionRoot();
    let entry = path.join(distribution, "dist/agent/server.js");
    const hotReload = /^(?:1|true|yes)$/iu.test(environment.CREATOR_HOT_RELOAD ?? readCreatorHostConfigValue(options.configRoot, "CREATOR_HOT_RELOAD") ?? "");
    let importLoader: string | undefined;
    if (hotReload) {
      try { const source = path.join(distribution, "src/agent/server.ts"); await access(source); importLoader = import.meta.resolve("tsx"); entry = source; }
      catch { options.log?.("Creator source hot reload is unavailable in this installation; using the built Node runtime."); }
    }
    await access(entry);
    const token = randomBytes(32).toString("hex");
    const child = spawn(process.execPath, [...(importLoader ? ["--import", importLoader] : []), entry, ...(importLoader ? ["--contracts-root", path.join(distribution, "contracts/creator")] : []), "--project-root", this.#root, "--skills-root", options.skillsRoot ?? path.join(distribution, "skills"), "--auth-token", token, "--port", "0", "--parent-pid", String(process.pid), ...(options.configRoot ? ["--config-root", path.resolve(options.configRoot)] : [])], {
      cwd: this.#root, env: { ...environment }, windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"],
    });
    this.#child = child;
    let stderr = "";
    child.stderr!.setEncoding("utf8"); child.stderr!.on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-8000); options.log?.(chunk.trimEnd()); });
    child.once("exit", () => { if (this.#child === child) { this.#child = undefined; this.#endpoint = undefined; } });
    try {
      const port = await new Promise<number>((resolve, reject) => {
        const lines = createInterface({ input: child.stdout! });
        const timer = setTimeout(() => { lines.close(); reject(new CreatorRuntimeError("CREATOR_START_TIMEOUT", stderr || "Creator runtime startup timed out.")); }, options.startupTimeoutMs ?? CREATOR_START_TIMEOUT_MS);
        const fail = () => { clearTimeout(timer); lines.close(); reject(new CreatorRuntimeError("CREATOR_START_FAILED", stderr || "Creator runtime exited before startup.")); };
        child.once("error", fail); child.once("exit", fail);
        lines.once("line", line => {
          clearTimeout(timer); lines.close(); child.off("error", fail); child.off("exit", fail);
          try { const handshake = JSON.parse(line); if (handshake.type !== "creator_ready" || !Number.isInteger(handshake.port) || handshake.port < 1 || handshake.port > 65535) throw new Error("CREATOR_HANDSHAKE_INVALID"); resolve(handshake.port); } catch (error) { reject(error); }
        });
      });
      const endpoint = await this.#checkHealth({ host: "127.0.0.1", port, authToken: token });
      if (this.#disposed) throw new Error("CREATOR_RUNTIME_DISPOSED");
      this.#endpoint = endpoint; options.log?.(`typescript runtime ready pid=${child.pid} port=${port}`);
      if (importLoader && !this.#watcher) {
        this.#fingerprint = await this.#sourceFingerprint(distribution);
        this.#watcher = setInterval(() => { void this.#pollSource(distribution); }, 1000);
        this.#watcher.unref();
      }
      return endpoint;
    } catch (error) { await this.#terminate(child); throw error; }
  }
  async #sourceFingerprint(distribution: string) {
    const entries: string[] = [];
    const visit = async (directory: string) => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) continue;
        const name = path.join(directory, entry.name);
        if (entry.isDirectory()) await visit(name);
        else { const info = await stat(name); entries.push(`${name}:${info.mtimeMs}:${info.size}`); }
      }
    };
    for (const directory of ["src/agent", "contracts", "skills"]) await visit(path.join(distribution, directory));
    return entries.sort().join("\n");
  }
  async #pollSource(distribution: string) {
    if (this.#disposed || this.#scanning || this.#restarting || !this.#endpoint) return;
    this.#scanning = true;
    try {
      const fingerprint = await this.#sourceFingerprint(distribution);
      if (fingerprint === this.#fingerprint) return;
      const endpoint = this.#endpoint;
      const response = await fetch(`http://${endpoint.host}:${endpoint.port}/health`, { headers: { Authorization: `Bearer ${endpoint.authToken}` }, signal: AbortSignal.timeout(1000) });
      const health = await response.json() as { busy?: boolean };
      // A progressing run or paused decision keeps its exact graph and authority.
      if (!response.ok || health.busy) return;
      const child = this.#child;
      if (!child) return;
      this.#fingerprint = fingerprint;
      const restart = (async () => {
        this.#endpoint = undefined; this.#child = undefined;
        await this.#terminate(child);
        if (!this.#disposed) await this.#start();
      })();
      this.#restarting = restart;
      try { await restart; } finally { this.#restarting = undefined; }
    } catch (error) { this.#options.log?.(`Creator source reload: ${error instanceof Error ? error.message : String(error)}`); }
    finally { this.#scanning = false; }
  }
  async #checkHealth(endpoint: CreatorExternalEndpoint): Promise<CreatorEndpoint> {
    const result = await fetch(`http://${endpoint.host}:${endpoint.port}/health`, { headers: { Authorization: `Bearer ${endpoint.authToken}` }, signal: AbortSignal.timeout(5000) });
    const health = await result.json() as Record<string, any>;
    if (!result.ok || health.runtime !== "typescript" || path.resolve(String(health.projectRoot)) !== this.#root || !["echo", "minimal", "domain-read", "domain-write"].includes(health.agentMode)) throw new CreatorRuntimeError("CREATOR_HEALTH_INVALID", "Creator runtime identity or project root is invalid.");
    return { ...endpoint, agentMode: health.agentMode };
  }
  async dispose(): Promise<void> {
    this.#disposed = true;
    if (this.#watcher) clearInterval(this.#watcher);
    // Observe startup/reload cancellation before terminating their child. A
    // deliberately interrupted handshake is not a failed shutdown.
    const starting = this.#starting?.catch(() => undefined);
    const restarting = this.#restarting?.catch(() => undefined);
    const child = this.#child;
    this.#child = undefined; this.#endpoint = undefined;
    if (child) await this.#terminate(child);
    await Promise.all([starting, restarting]);
  }
  async #terminate(child: ChildProcess) {
    await terminateProcessTree(child, this.#options.stopTimeoutMs ?? CREATOR_STOP_TIMEOUT_MS);
  }
}
