import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
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
import { CreatorFileObservationStore } from "./files/CreatorFileObservationStore.js";
import {
  CreatorFileStateConflictError,
  createCreatorFileAtomically,
  replaceCreatorFileAtomically,
} from "./files/creatorFileState.js";

interface CommandSpec {
  executable: string;
  args: string[];
  kind: "validation" | "mutation";
  mutationPaths?: string[] | undefined;
}

const MAX_COMMAND_OUTPUT_BYTES = 100_000;
const COMMAND_TIMEOUT_MS = 120_000;

export const CREATOR_ALLOWED_COMMANDS: Readonly<Record<string, CommandSpec>> = {
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
};

const CREATOR_COMMAND_ALIASES: Readonly<Record<string, string>> = {
  "pnpm run test": "pnpm test",
  "pnpm run typecheck": "pnpm typecheck",
  "pnpm run verify:ui": "pnpm verify:ui",
  "pnpm run generate:registry": "pnpm generate:registry",
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
  private readonly projectRoot: string;
  private readonly activity: CreatorActivityRecorder | undefined;
  private readonly observations: CreatorFileObservationStore;

  constructor({ projectRoot, activity }: ProjectCreatorBackendOptions) {
    const resolvedProjectRoot = path.resolve(projectRoot);

    super({
      rootDir: resolvedProjectRoot,
      virtualMode: true,
    });
    this.projectRoot = resolvedProjectRoot;
    this.activity = activity;
    this.observations =
      activity?.fileObservations ??
      new CreatorFileObservationStore(resolvedProjectRoot);
  }

  override async read(
    filePath: string,
    offset?: number,
    limit?: number,
  ): Promise<ReadResult> {
    try {
      return await this.observations.observeStableRead(
        filePath,
        () => super.read(filePath, offset, limit),
        (result) => result.error === undefined,
      );
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  override async readRaw(filePath: string): Promise<ReadRawResult> {
    try {
      return await this.observations.observeStableRead(
        filePath,
        () => super.readRaw(filePath),
        (result) => result.error === undefined,
      );
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  override async write(
    filePath: string,
    content: string,
  ): Promise<WriteResult> {
    try {
      const current = await this.observations.assertFreshForWrite(filePath);
      if (current.exists && current.content === content) {
        await this.observations.observe(filePath);
        return { path: filePath, filesUpdate: null };
      }
      this.activity?.captureBeforeContent(filePath, current.content);
      if (current.exists) {
        await replaceCreatorFileAtomically(
          this.projectRoot,
          filePath,
          content,
          current,
        );
      } else {
        await createCreatorFileAtomically(this.projectRoot, filePath, content);
      }
      await this.observations.observe(filePath);
      this.activity?.touch(filePath);
      return { path: filePath, filesUpdate: null };
    } catch (error) {
      const message =
        error instanceof CreatorFileStateConflictError ||
        (error as NodeJS.ErrnoException).code === "EEXIST"
          ? `stale-version: ${filePath} changed before Creator could commit the write. Read it again.`
          : error instanceof Error
            ? error.message
            : String(error);
      return { error: message };
    }
  }

  override async edit(
    filePath: string,
    oldString: string,
    newString: string,
    replaceAll = false,
  ): Promise<EditResult> {
    try {
      const current = await this.observations.assertFreshForEdit(filePath);
      const source = current.content;
      if (source === undefined) {
        return { error: `File not found: ${filePath}` };
      }
      if (oldString === "" && source !== "") {
        return { error: "Error: oldString cannot be empty when file has content" };
      }
      const initializesEmptyFile = source === "" && oldString === "";
      const occurrences =
        initializesEmptyFile ? 0 : source.split(oldString).length - 1;
      if (occurrences === 0 && !initializesEmptyFile) {
        return { error: `Error: String not found in file: '${oldString}'` };
      }
      if (occurrences > 1 && !replaceAll) {
        return {
          error: `Error: String '${oldString}' has multiple occurrences (appears ${occurrences} times) in file. Use replace_all=True to replace all instances, or provide a more specific string with surrounding context.`,
        };
      }
      const content =
        initializesEmptyFile
          ? newString
          : replaceAll
            ? source.split(oldString).join(newString)
            : source.replace(oldString, newString);
      if (content === source) {
        await this.observations.observe(filePath);
        return { path: filePath, filesUpdate: null, occurrences };
      }
      this.activity?.captureBeforeContent(filePath, current.content);
      await replaceCreatorFileAtomically(
        this.projectRoot,
        filePath,
        content,
        current,
      );
      await this.observations.observe(filePath);
      this.activity?.touch(filePath);
      return { path: filePath, filesUpdate: null, occurrences };
    } catch (error) {
      return {
        error:
          error instanceof CreatorFileStateConflictError
            ? `stale-version: ${filePath} changed before Creator could commit the edit. Read it again.`
            : error instanceof Error
              ? error.message
              : String(error),
      };
    }
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

    const mutationBefore = new Map<string, string | undefined>();
    if (spec.kind === "mutation") {
      for (const filePath of spec.mutationPaths ?? []) {
        await this.activity?.captureBefore(filePath);
        mutationBefore.set(filePath, await this.readMutationFile(filePath));
      }
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

      const finish = async (result: ExecuteResponse): Promise<void> => {
        if (settled) {
          return;
        }
        settled = true;
        if (spec.kind === "validation") {
          this.activity?.recordValidation(normalizedCommand, result);
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
          output: timedOut
            ? `${output}\nCommand timed out after ${COMMAND_TIMEOUT_MS}ms.`
            : output,
          exitCode,
          truncated,
        });
      });
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

  private filesystemUnavailable(filePath: string): { error: string } {
    return {
      error: `Filesystem access is only available under /project (${filePath}).`,
    };
  }
}
