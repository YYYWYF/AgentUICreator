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
import {
  CREATOR_AGENT_ALLOWED_COMMANDS,
  CREATOR_COMMAND_SPECS,
  CreatorCommandRunner,
  normalizeCreatorCommand,
  type CreatorCommandExecutor,
  type CreatorKnownCommand,
} from "./CreatorCommandRunner.js";
import { CreatorFileObservationStore } from "./files/CreatorFileObservationStore.js";
import {
  CreatorFileStateConflictError,
  createCreatorFileAtomically,
  replaceCreatorFileAtomically,
} from "./files/creatorFileState.js";
import { CREATOR_COMPLETION_VALIDATIONS } from "./validation/types.js";

const CREATOR_AGENT_ALLOWED_COMMAND_SET = new Set<string>(
  CREATOR_AGENT_ALLOWED_COMMANDS,
);
const CREATOR_HOST_VALIDATION_COMMAND_SET = new Set<string>(
  CREATOR_COMPLETION_VALIDATIONS,
);

export const CREATOR_ALLOWED_COMMANDS = Object.fromEntries(
  CREATOR_AGENT_ALLOWED_COMMANDS.map((command) => [
    command,
    CREATOR_COMMAND_SPECS[command],
  ]),
);

export interface ProjectCreatorBackendOptions {
  projectRoot: string;
  activity?: CreatorActivityRecorder | undefined;
}

export interface ProjectCommandBackendOptions
  extends ProjectCreatorBackendOptions {
  runner?: CreatorCommandExecutor | undefined;
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

  private readonly runner: CreatorCommandExecutor;

  constructor({ projectRoot, activity, runner }: ProjectCommandBackendOptions) {
    this.runner =
      runner ?? new CreatorCommandRunner({ projectRoot, activity });
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
    if (CREATOR_HOST_VALIDATION_COMMAND_SET.has(normalizedCommand)) {
      return {
        output: `Command is Host-owned completion validation (${JSON.stringify(
          normalizedCommand,
        )}). The Creator Host will run it automatically when you submit a candidate completion.`,
        exitCode: 126,
        truncated: false,
      };
    }
    if (!CREATOR_AGENT_ALLOWED_COMMAND_SET.has(normalizedCommand)) {
      return {
        output: `Command is not allowed (${JSON.stringify(
          normalizedCommand,
        )}). Run exactly one of: ${CREATOR_AGENT_ALLOWED_COMMANDS.join(
          ", ",
        )}`,
        exitCode: 126,
        truncated: false,
      };
    }

    return this.runner.executeKnownCommand(
      normalizedCommand as CreatorKnownCommand,
    );
  }

  private filesystemUnavailable(filePath: string): { error: string } {
    return {
      error: `Filesystem access is only available under /project (${filePath}).`,
    };
  }
}
