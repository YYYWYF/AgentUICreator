import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";

import {
  FilesystemBackend,
  type DeleteResult,
  type EditResult,
  type ExecuteResponse,
  type GlobResult,
  type GrepResult,
  type LsResult,
  type ReadRawResult,
  type ReadResult,
  type SandboxBackendProtocolV2,
  type WriteResult,
} from "deepagents";

import type { CreatorActivityRecorder } from "./CreatorActivityRecorder.js";

interface CommandSpec {
  executable: string;
  args: string[];
}

const MAX_COMMAND_OUTPUT_BYTES = 100_000;
const COMMAND_TIMEOUT_MS = 120_000;

export const CREATOR_ALLOWED_COMMANDS: Readonly<Record<string, CommandSpec>> = {
  "git diff --check": {
    executable: "git",
    args: ["diff", "--check"],
  },
  "pnpm test": {
    executable: "pnpm",
    args: ["test"],
  },
  "pnpm typecheck": {
    executable: "pnpm",
    args: ["typecheck"],
  },
};

const CREATOR_COMMAND_ALIASES: Readonly<Record<string, string>> = {
  "pnpm run test": "pnpm test",
  "pnpm run typecheck": "pnpm typecheck",
};

function normalizeCreatorCommand(command: string): string {
  const normalized = command
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/gu, "")
    .trim()
    .replace(/\s+/gu, " ");

  return CREATOR_COMMAND_ALIASES[normalized] ?? normalized;
}

export interface ProjectCreatorBackendOptions {
  projectRoot: string;
  activity?: CreatorActivityRecorder | undefined;
}

export interface CreatorSkillsBackendOptions {
  skillsRoot: string;
}

export class ProjectCreatorBackend extends FilesystemBackend {
  private readonly activity: CreatorActivityRecorder | undefined;

  constructor({ projectRoot, activity }: ProjectCreatorBackendOptions) {
    const resolvedProjectRoot = path.resolve(projectRoot);

    super({
      rootDir: resolvedProjectRoot,
      virtualMode: true,
    });
    this.activity = activity;
  }

  override async write(
    filePath: string,
    content: string,
  ): Promise<WriteResult> {
    await this.activity?.captureBefore(filePath);
    const result = await super.write(filePath, content);
    this.activity?.touch(filePath);
    return result;
  }

  override async edit(
    filePath: string,
    oldString: string,
    newString: string,
    replaceAll = false,
  ): Promise<EditResult> {
    await this.activity?.captureBefore(filePath);
    const result = await super.edit(
      filePath,
      oldString,
      newString,
      replaceAll,
    );
    this.activity?.touch(filePath);
    return result;
  }

  override async delete(filePath: string): Promise<DeleteResult> {
    return {
      error: `Deletion is disabled for the Creator (${filePath}).`,
    };
  }
}

export class CreatorSkillsBackend extends FilesystemBackend {
  constructor({ skillsRoot }: CreatorSkillsBackendOptions) {
    super({
      rootDir: path.resolve(skillsRoot),
      virtualMode: true,
    });
  }

  override async write(
    filePath: string,
    _content: string,
  ): Promise<WriteResult> {
    return { error: `Creator skills are read-only (${filePath}).` };
  }

  override async edit(
    filePath: string,
    _oldString: string,
    _newString: string,
    _replaceAll = false,
  ): Promise<EditResult> {
    return { error: `Creator skills are read-only (${filePath}).` };
  }

  override async delete(filePath: string): Promise<DeleteResult> {
    return { error: `Creator skills are read-only (${filePath}).` };
  }
}

export class ProjectCommandBackend implements SandboxBackendProtocolV2 {
  readonly id = `agent-ui-creator-command-${randomUUID()}`;

  private readonly projectRoot: string;
  private readonly activity: CreatorActivityRecorder | undefined;

  constructor({ projectRoot, activity }: ProjectCreatorBackendOptions) {
    this.projectRoot = path.resolve(projectRoot);
    this.activity = activity;
  }

  async ls(filePath: string): Promise<LsResult> {
    return this.filesystemUnavailable(filePath);
  }

  async read(filePath: string): Promise<ReadResult> {
    return this.filesystemUnavailable(filePath);
  }

  async readRaw(filePath: string): Promise<ReadRawResult> {
    return this.filesystemUnavailable(filePath);
  }

  async write(filePath: string): Promise<WriteResult> {
    return this.filesystemUnavailable(filePath);
  }

  async edit(filePath: string): Promise<EditResult> {
    return this.filesystemUnavailable(filePath);
  }

  async delete(filePath: string): Promise<DeleteResult> {
    return this.filesystemUnavailable(filePath);
  }

  async glob(_pattern: string, filePath = "/"): Promise<GlobResult> {
    return this.filesystemUnavailable(filePath);
  }

  async grep(
    _pattern: string,
    filePath: string | null = "/",
  ): Promise<GrepResult> {
    return this.filesystemUnavailable(filePath ?? "/");
  }

  async execute(command: string): Promise<ExecuteResponse> {
    const normalizedCommand = normalizeCreatorCommand(command);
    const spec = CREATOR_ALLOWED_COMMANDS[normalizedCommand];

    if (spec === undefined) {
      return {
        output: `Command is not allowed (${JSON.stringify(
          normalizedCommand,
        )}). Run exactly one of: ${Object.keys(CREATOR_ALLOWED_COMMANDS).join(
          ", ",
        )}`,
        exitCode: 126,
        truncated: false,
      };
    }

    return new Promise((resolve) => {
      const child = spawn(spec.executable, spec.args, {
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

      const finish = (result: ExecuteResponse): void => {
        if (settled) {
          return;
        }
        settled = true;
        this.activity?.recordValidation(normalizedCommand, result);
        resolve(result);
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
        finish({
          output: error.message,
          exitCode: null,
          truncated,
        });
      });

      child.on("close", (exitCode) => {
        clearTimeout(timeout);
        finish({
          output: timedOut
            ? `${output}\nCommand timed out after ${COMMAND_TIMEOUT_MS}ms.`
            : output,
          exitCode,
          truncated,
        });
      });
    });
  }

  private filesystemUnavailable(filePath: string): { error: string } {
    return {
      error: `Filesystem access is only available under /project (${filePath}).`,
    };
  }
}
