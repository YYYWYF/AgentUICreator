import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";

import {
  CREATOR_PROJECT_CONTROL_SCHEMA_VERSION,
  parseProjectControlResponse,
  type ProjectControlOperation,
  type ProjectControlRequest,
  type ProjectControlResponse,
} from "./types.js";

export const PROJECT_CONTROL_ENTRY_PATH = "scripts/ui-project-control.ts";
export const PROJECT_CONTROL_TIMEOUT_MS = 15_000;
export const MAX_PROJECT_CONTROL_OUTPUT_BYTES = 1_000_000;

const projectMutationTails = new Map<string, Promise<void>>();

async function withProjectMutationLock<T>(
  projectRoot: string,
  task: () => Promise<T>,
): Promise<T> {
  const previous = projectMutationTails.get(projectRoot) ?? Promise.resolve();
  let release = (): void => undefined;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  projectMutationTails.set(projectRoot, current);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (projectMutationTails.get(projectRoot) === current) {
      projectMutationTails.delete(projectRoot);
    }
  }
}

export class ProjectControlAdapterError extends Error {
  readonly code: string;
  readonly details: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ProjectControlAdapterError";
    this.code = code;
    this.details = details;
  }
}

export interface ProjectControlAdapterOptions {
  projectRoot: string;
  timeoutMs?: number | undefined;
}

export class ProjectControlAdapter {
  private readonly projectRoot: string;
  private readonly entryPath: string;
  private readonly executablePath: string;
  private readonly timeoutMs: number;

  constructor({
    projectRoot,
    timeoutMs = PROJECT_CONTROL_TIMEOUT_MS,
  }: ProjectControlAdapterOptions) {
    this.projectRoot = path.resolve(projectRoot);
    this.entryPath = path.join(this.projectRoot, PROJECT_CONTROL_ENTRY_PATH);
    this.executablePath = path.join(
      this.projectRoot,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "tsx.cmd" : "tsx",
    );
    this.timeoutMs = timeoutMs;
  }

  async request(
    operation: ProjectControlOperation,
    input: Record<string, unknown> = {},
  ): Promise<unknown> {
    if (operation === "mutate_app_ui_model") {
      return this.withMutationLock(() =>
        this.requestWithoutLock(operation, input),
      );
    }
    return this.requestWithoutLock(operation, input);
  }

  async withMutationLock<T>(task: () => Promise<T>): Promise<T> {
    return withProjectMutationLock(this.projectRoot, task);
  }

  private async requestWithoutLock(
    operation: ProjectControlOperation,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    await this.ensureFixedRuntime();
    const request: ProjectControlRequest = {
      schemaVersion: CREATOR_PROJECT_CONTROL_SCHEMA_VERSION,
      operation,
      input,
    };
    const execution = await this.execute(JSON.stringify(request));
    let decoded: unknown;
    try {
      decoded = JSON.parse(execution.stdout) as unknown;
    } catch (error) {
      throw new ProjectControlAdapterError(
        "CONTROL_PROTOCOL_INVALID_JSON",
        "The target project control entry did not return valid JSON.",
        {
          stdout: execution.stdout.slice(0, 2_000),
          stderr: execution.stderr.slice(0, 2_000),
          cause: error instanceof Error ? error.message : String(error),
        },
      );
    }

    let parsed: ProjectControlResponse;
    try {
      parsed = parseProjectControlResponse(decoded);
    } catch (error) {
      throw new ProjectControlAdapterError(
        "CONTROL_PROTOCOL_INCOMPATIBLE",
        `The target project control response is incompatible with schema version ${CREATOR_PROJECT_CONTROL_SCHEMA_VERSION}.`,
        { cause: error instanceof Error ? error.message : String(error) },
      );
    }
    if (!parsed.ok) {
      throw new ProjectControlAdapterError(
        parsed.error.code,
        parsed.error.message,
        parsed.error.details,
      );
    }
    if (execution.exitCode !== 0) {
      throw new ProjectControlAdapterError(
        "CONTROL_ENTRY_FAILED",
        `The target project control entry exited with code ${execution.exitCode}.`,
        { stderr: execution.stderr.slice(0, 2_000) },
      );
    }
    return parsed.result;
  }

  private async ensureFixedRuntime(): Promise<void> {
    try {
      await access(this.entryPath);
    } catch {
      throw new ProjectControlAdapterError(
        "CONTROL_ENTRY_MISSING",
        `Target project control entry is missing: ${PROJECT_CONTROL_ENTRY_PATH}.`,
      );
    }
    try {
      await access(this.executablePath);
    } catch {
      throw new ProjectControlAdapterError(
        "CONTROL_RUNTIME_MISSING",
        "Target project dependencies are not installed; node_modules/.bin/tsx is unavailable.",
      );
    }
  }

  private execute(source: string): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number | null;
  }> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.executablePath, [this.entryPath], {
        cwd: this.projectRoot,
        env: {
          CI: "1",
          FORCE_COLOR: "0",
          PATH: process.env.PATH ?? "",
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let outputBytes = 0;
      let settled = false;

      const finish = (
        action: () => void,
      ): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        action();
      };
      const append = (target: "stdout" | "stderr", chunk: Buffer): void => {
        outputBytes += chunk.byteLength;
        if (outputBytes > MAX_PROJECT_CONTROL_OUTPUT_BYTES) {
          child.kill("SIGTERM");
          finish(() =>
            reject(
              new ProjectControlAdapterError(
                "CONTROL_OUTPUT_TOO_LARGE",
                `Target project control output exceeds ${MAX_PROJECT_CONTROL_OUTPUT_BYTES} bytes.`,
              ),
            ),
          );
          return;
        }
        if (target === "stdout") {
          stdout += chunk.toString("utf8");
        } else {
          stderr += chunk.toString("utf8");
        }
      };
      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        finish(() =>
          reject(
            new ProjectControlAdapterError(
              "CONTROL_ENTRY_TIMEOUT",
              `Target project control entry timed out after ${this.timeoutMs}ms.`,
            ),
          ),
        );
      }, this.timeoutMs);

      child.stdout.on("data", (chunk: Buffer) => append("stdout", chunk));
      child.stderr.on("data", (chunk: Buffer) => append("stderr", chunk));
      child.on("error", (error) =>
        finish(() =>
          reject(
            new ProjectControlAdapterError(
              "CONTROL_ENTRY_SPAWN_FAILED",
              error.message,
            ),
          ),
        ),
      );
      child.on("close", (exitCode) =>
        finish(() => resolve({ stdout, stderr, exitCode })),
      );
      child.stdin.end(source);
    });
  }
}
