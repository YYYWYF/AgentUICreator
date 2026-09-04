import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ExecuteResponse } from "deepagents";

import type { CreatorActivityRecorder } from "./CreatorActivityRecorder.js";

interface CreatorCommandSpec {
  executable: string;
  args: readonly string[];
  kind: "validation" | "mutation";
  mutationPaths?: readonly string[] | undefined;
}

const MAX_COMMAND_OUTPUT_BYTES = 100_000;
const COMMAND_TIMEOUT_MS = 120_000;

export const CREATOR_COMMAND_SPECS = {
  "git diff --check": {
    executable: "git",
    args: ["diff", "--check"],
    kind: "validation",
  },
  "pnpm generate:registry": {
    executable: "pnpm",
    args: ["generate:registry"],
    kind: "mutation",
    mutationPaths: ["/project/plugins/registry.generated.ts"],
  },
  "pnpm test": {
    executable: "pnpm",
    args: ["test"],
    kind: "validation",
  },
  "pnpm typecheck": {
    executable: "pnpm",
    args: ["typecheck"],
    kind: "validation",
  },
  "pnpm verify:ui": {
    executable: "pnpm",
    args: ["verify:ui"],
    kind: "validation",
  },
} as const satisfies Readonly<Record<string, CreatorCommandSpec>>;

export type CreatorKnownCommand = keyof typeof CREATOR_COMMAND_SPECS;

export const CREATOR_AGENT_ALLOWED_COMMANDS = [
  "git diff --check",
  "pnpm generate:registry",
  "pnpm test",
] as const satisfies readonly CreatorKnownCommand[];

const CREATOR_COMMAND_ALIASES: Readonly<Record<string, CreatorKnownCommand>> = {
  "pnpm run test": "pnpm test",
  "pnpm run typecheck": "pnpm typecheck",
  "pnpm run verify:ui": "pnpm verify:ui",
  "pnpm run generate:registry": "pnpm generate:registry",
};

export function normalizeCreatorCommand(command: string): string {
  const normalized = command
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/gu, "")
    .trim()
    .replace(/\s+/gu, " ");

  return CREATOR_COMMAND_ALIASES[normalized] ?? normalized;
}

export interface CreatorCommandRunnerOptions {
  projectRoot: string;
  activity?: CreatorActivityRecorder | undefined;
}

export interface ExecuteKnownCommandOptions {
  signal?: AbortSignal | undefined;
}

export interface CreatorCommandExecutor {
  executeKnownCommand(
    command: CreatorKnownCommand,
    options?: ExecuteKnownCommandOptions,
  ): Promise<ExecuteResponse>;
}

export class CreatorCommandRunner implements CreatorCommandExecutor {
  private readonly projectRoot: string;
  private readonly activity: CreatorActivityRecorder | undefined;

  constructor({ projectRoot, activity }: CreatorCommandRunnerOptions) {
    this.projectRoot = path.resolve(projectRoot);
    this.activity = activity;
  }

  async executeKnownCommand(
    command: CreatorKnownCommand,
    options: ExecuteKnownCommandOptions = {},
  ): Promise<ExecuteResponse> {
    const spec = CREATOR_COMMAND_SPECS[command];
    const validationRevision = this.activity?.revision;
    const mutationBefore = new Map<string, string | undefined>();
    if (spec.kind === "mutation") {
      for (const filePath of spec.mutationPaths ?? []) {
        await this.activity?.captureBefore(filePath);
        mutationBefore.set(filePath, await this.readMutationFile(filePath));
      }
    }

    return new Promise((resolve) => {
      const child = spawn(spec.executable, [...spec.args], {
        cwd: this.projectRoot,
        env: {
          CI: "1",
          FORCE_COLOR: "0",
          PATH: process.env.PATH ?? "",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let output = "";
      let settled = false;
      let truncated = false;
      let timedOut = false;
      let aborted = false;

      const finish = async (result: ExecuteResponse): Promise<void> => {
        if (settled) {
          return;
        }
        settled = true;
        options.signal?.removeEventListener("abort", abort);
        if (spec.kind === "validation") {
          this.activity?.recordValidation(command, result, validationRevision);
        } else if (result.exitCode === 0) {
          for (const filePath of spec.mutationPaths ?? []) {
            if (
              mutationBefore.get(filePath) !==
              (await this.readMutationFile(filePath))
            ) {
              this.activity?.touch(filePath);
            }
          }
        }
        resolve(result);
      };

      const abort = (): void => {
        aborted = true;
        child.kill("SIGTERM");
      };

      const appendOutput = (chunk: Buffer): void => {
        if (output.length >= MAX_COMMAND_OUTPUT_BYTES) {
          truncated = true;
          return;
        }

        const remainingBytes = MAX_COMMAND_OUTPUT_BYTES - output.length;
        const text = chunk.toString("utf8");
        output += text.slice(0, remainingBytes);
        truncated ||= text.length > remainingBytes;
      };

      child.stdout.on("data", appendOutput);
      child.stderr.on("data", appendOutput);

      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, COMMAND_TIMEOUT_MS);

      child.on("error", (error) => {
        clearTimeout(timeout);
        void finish({
          output: error.message,
          exitCode: null,
          truncated,
        });
      });

      child.on("close", (exitCode) => {
        clearTimeout(timeout);
        void finish({
          output: aborted
            ? `${output}\nCommand aborted.`
            : timedOut
              ? `${output}\nCommand timed out after ${COMMAND_TIMEOUT_MS}ms.`
              : output,
          exitCode: aborted ? null : exitCode,
          truncated,
        });
      });

      if (options.signal?.aborted) {
        abort();
      } else {
        options.signal?.addEventListener("abort", abort, { once: true });
      }
    });
  }

  private async readMutationFile(filePath: string): Promise<string | undefined> {
    const relativePath = filePath
      .replace(/^\/project\//u, "")
      .replace(/^\/+/, "");
    const absolutePath = path.resolve(this.projectRoot, relativePath);
    if (
      absolutePath !== this.projectRoot &&
      !absolutePath.startsWith(`${this.projectRoot}${path.sep}`)
    ) {
      return undefined;
    }
    try {
      return await readFile(absolutePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }
}
