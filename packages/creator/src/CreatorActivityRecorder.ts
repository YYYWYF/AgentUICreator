import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ExecuteResponse } from "deepagents";
import { createTwoFilesPatch, FILE_HEADERS_ONLY } from "diff";

import type {
  CreatorFileChangeReceipt,
  CreatorRunReceipt,
  CreatorValidationReceipt,
} from "./receiptTypes.js";

const DIFF_CONTEXT_LINES = 3;
const MAX_DIFF_CHARACTERS = 20_000;
const MAX_VALIDATION_OUTPUT_CHARACTERS = 8_000;

function truncate(source: string, limit: number, suffix: string) {
  return source.length <= limit
    ? { text: source, truncated: false }
    : {
        text: `${source.slice(0, limit)}\n${suffix}`,
        truncated: true,
      };
}

function unifiedDiff(
  filePath: string,
  before: string | undefined,
  after: string,
): { diff: string; truncated: boolean } {
  const patch = createTwoFilesPatch(
    before === undefined ? "/dev/null" : `a/${filePath}`,
    `b/${filePath}`,
    before ?? "",
    after,
    undefined,
    undefined,
    {
      context: DIFF_CONTEXT_LINES,
      headerOptions: FILE_HEADERS_ONLY,
    },
  ).trimEnd();
  const result = truncate(
    patch,
    MAX_DIFF_CHARACTERS,
    "… Diff 内容过长，已截断",
  );
  return { diff: result.text, truncated: result.truncated };
}

interface ProjectFileLocation {
  absolutePath: string;
  receiptPath: string;
}

export class CreatorActivityRecorder {
  private readonly projectRoot: string;
  private readonly beforeByPath = new Map<string, string | undefined>();
  private readonly touchedPaths = new Set<string>();
  private readonly validations: CreatorValidationReceipt[] = [];

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
  }

  begin(): void {
    this.beforeByPath.clear();
    this.touchedPaths.clear();
    this.validations.splice(0);
  }

  async captureBefore(filePath: string): Promise<void> {
    const location = this.projectFile(filePath);
    if (
      location === undefined ||
      this.beforeByPath.has(location.receiptPath)
    ) {
      return;
    }

    try {
      this.beforeByPath.set(
        location.receiptPath,
        await readFile(location.absolutePath, "utf8"),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      this.beforeByPath.set(location.receiptPath, undefined);
    }
  }

  touch(filePath: string): void {
    const location = this.projectFile(filePath);
    if (location !== undefined) {
      this.touchedPaths.add(location.receiptPath);
    }
  }

  recordValidation(command: string, result: ExecuteResponse): void {
    const output = truncate(
      result.output.trim(),
      MAX_VALIDATION_OUTPUT_CHARACTERS,
      "… 验证输出过长，已截断",
    );
    this.validations.push({
      command,
      status: result.exitCode === 0 ? "passed" : "failed",
      exitCode: result.exitCode,
      output: output.text,
      truncated: result.truncated || output.truncated,
    });
  }

  async finish(): Promise<CreatorRunReceipt> {
    const files: CreatorFileChangeReceipt[] = [];

    for (const filePath of [...this.touchedPaths].sort()) {
      const location = this.projectFile(filePath);
      if (location === undefined) {
        continue;
      }

      let after: string;
      try {
        after = await readFile(location.absolutePath, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          continue;
        }
        throw error;
      }

      const before = this.beforeByPath.get(filePath);
      if (before === after) {
        continue;
      }

      const diff = unifiedDiff(filePath, before, after);
      files.push({
        path: filePath,
        status: before === undefined ? "created" : "modified",
        diff: diff.diff,
        truncated: diff.truncated,
      });
    }

    return { files, validations: [...this.validations] };
  }

  private projectFile(filePath: string): ProjectFileLocation | undefined {
    const withoutMount = filePath.replace(/^\/project\//u, "/");
    const relativePath = withoutMount.replace(/^\/+/, "");
    const absolutePath = path.resolve(this.projectRoot, relativePath);
    if (
      absolutePath !== this.projectRoot &&
      !absolutePath.startsWith(`${this.projectRoot}${path.sep}`)
    ) {
      return undefined;
    }

    return {
      absolutePath,
      receiptPath: relativePath.split(path.sep).join("/"),
    };
  }
}
