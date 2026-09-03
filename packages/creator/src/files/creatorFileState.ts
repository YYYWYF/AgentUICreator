import { createHash, randomUUID } from "node:crypto";
import {
  link,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

export const CREATOR_MISSING_FILE_HASH = createHash("sha256")
  .update("<missing>")
  .digest("hex");

export interface CreatorProjectFileLocation {
  absolutePath: string;
  receiptPath: string;
}

export interface CreatorFileState {
  exists: boolean;
  hash: string;
  content?: string | undefined;
}

export class CreatorFileStateConflictError extends Error {
  constructor(filePath: string) {
    super(`File changed before atomic commit: ${filePath}`);
    this.name = "CreatorFileStateConflictError";
  }
}

export function creatorContentHash(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

export function resolveCreatorProjectFile(
  projectRoot: string,
  filePath: string,
): CreatorProjectFileLocation {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const withoutMount = filePath.replace(/^\/project\//u, "/");
  const relativePath = withoutMount.replace(/^\/+/, "");
  const absolutePath = path.resolve(resolvedProjectRoot, relativePath);
  if (
    absolutePath === resolvedProjectRoot ||
    !absolutePath.startsWith(`${resolvedProjectRoot}${path.sep}`)
  ) {
    throw new Error(`Path traversal not allowed: ${filePath}`);
  }
  return {
    absolutePath,
    receiptPath: relativePath.split(path.sep).join("/"),
  };
}

function isWithin(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

async function realProjectRoot(projectRoot: string): Promise<string> {
  return realpath(path.resolve(projectRoot));
}

async function assertExistingPathContained(
  projectRoot: string,
  absolutePath: string,
): Promise<void> {
  const [root, candidate] = await Promise.all([
    realProjectRoot(projectRoot),
    realpath(absolutePath),
  ]);
  if (!isWithin(root, candidate)) {
    throw new Error(`Resolved path leaves the Creator project: ${absolutePath}`);
  }
}

async function nearestExistingDirectory(directoryPath: string): Promise<string> {
  let candidate = directoryPath;
  while (true) {
    try {
      const info = await lstat(candidate);
      if (!info.isDirectory()) {
        throw new Error(`Expected a directory: ${candidate}`);
      }
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      const parent = path.dirname(candidate);
      if (parent === candidate) {
        throw error;
      }
      candidate = parent;
    }
  }
}

async function ensureContainedParent(
  projectRoot: string,
  absolutePath: string,
): Promise<void> {
  const parent = path.dirname(absolutePath);
  await assertExistingPathContained(
    projectRoot,
    await nearestExistingDirectory(parent),
  );
  await mkdir(parent, { recursive: true });
  await assertExistingPathContained(projectRoot, parent);
}

export async function readCreatorFileState(
  projectRoot: string,
  filePath: string,
): Promise<CreatorFileState> {
  const location = resolveCreatorProjectFile(projectRoot, filePath);
  try {
    await assertExistingPathContained(projectRoot, location.absolutePath);
    const content = await readFile(location.absolutePath);
    return {
      exists: true,
      hash: creatorContentHash(content),
      content: content.toString("utf8"),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { exists: false, hash: CREATOR_MISSING_FILE_HASH };
    }
    throw error;
  }
}

async function stagedTextFile(
  projectRoot: string,
  absolutePath: string,
  content: string,
): Promise<string> {
  await ensureContainedParent(projectRoot, absolutePath);
  const temporaryPath = path.join(
    path.dirname(absolutePath),
    `.${path.basename(absolutePath)}.creator-${process.pid}-${randomUUID()}.tmp`,
  );
  await writeFile(temporaryPath, content, { encoding: "utf8", flag: "wx" });
  return temporaryPath;
}

export async function replaceCreatorFileAtomically(
  projectRoot: string,
  filePath: string,
  content: string,
  expected?: Pick<CreatorFileState, "exists" | "hash"> | undefined,
): Promise<void> {
  const location = resolveCreatorProjectFile(projectRoot, filePath);
  const temporaryPath = await stagedTextFile(
    projectRoot,
    location.absolutePath,
    content,
  );
  try {
    if (expected !== undefined) {
      const current = await readCreatorFileState(projectRoot, filePath);
      if (
        current.exists !== expected.exists ||
        current.hash !== expected.hash
      ) {
        throw new CreatorFileStateConflictError(filePath);
      }
    }
    await rename(temporaryPath, location.absolutePath);
  } finally {
    await unlink(temporaryPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") {
        throw error;
      }
    });
  }
}

export async function createCreatorFileAtomically(
  projectRoot: string,
  filePath: string,
  content: string,
): Promise<void> {
  const location = resolveCreatorProjectFile(projectRoot, filePath);
  const temporaryPath = await stagedTextFile(
    projectRoot,
    location.absolutePath,
    content,
  );
  try {
    await link(temporaryPath, location.absolutePath);
  } finally {
    await unlink(temporaryPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") {
        throw error;
      }
    });
  }
}

export async function removeCreatorFile(
  projectRoot: string,
  filePath: string,
  expected?: Pick<CreatorFileState, "exists" | "hash"> | undefined,
): Promise<void> {
  const location = resolveCreatorProjectFile(projectRoot, filePath);
  if (expected !== undefined) {
    const current = await readCreatorFileState(projectRoot, filePath);
    if (
      current.exists !== expected.exists ||
      current.hash !== expected.hash
    ) {
      throw new CreatorFileStateConflictError(filePath);
    }
  }
  await unlink(location.absolutePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") {
      throw error;
    }
  });
}
