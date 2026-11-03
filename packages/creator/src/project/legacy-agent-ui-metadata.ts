import { lstat, mkdir, readFile, readdir, realpath, rename, rmdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const LEGACY_ROOT = ".agentui";
const LEGACY_CREATOR_ROOT = ".agentuicreator";
const CURRENT_ROOT = ".agent-ui";

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

async function entry(pathname: string) {
  try {
    return await lstat(pathname);
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

async function assertRegularTree(directory: string): Promise<void> {
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error(`Legacy Agent UI data must be a regular directory: ${directory}`);
  }
  for (const child of await readdir(directory, { withFileTypes: true })) {
    const childPath = path.join(directory, child.name);
    const childInfo = await lstat(childPath);
    if (childInfo.isSymbolicLink()) {
      throw new Error(`Legacy Agent UI data cannot contain symbolic links: ${childPath}`);
    }
    if (childInfo.isDirectory()) await assertRegularTree(childPath);
    else if (!childInfo.isFile()) throw new Error(`Unsupported legacy Agent UI entry: ${childPath}`);
  }
}

async function mergeIgnoreFile(source: string, destination: string): Promise<void> {
  const oldLines = (await readFile(source, "utf8")).split(/\r?\n/u).filter(Boolean);
  const currentLines = (await readFile(destination, "utf8")).split(/\r?\n/u).filter(Boolean);
  const merged = [...currentLines];
  for (const line of oldLines) if (!merged.includes(line)) merged.push(line);
  await writeFile(destination, merged.length ? `${merged.join("\n")}\n` : "", "utf8");
  await unlink(source);
}

async function mergeDirectory(source: string, destination: string): Promise<void> {
  const destinationInfo = await entry(destination);
  if (!destinationInfo) {
    await rename(source, destination);
    return;
  }
  if (destinationInfo.isSymbolicLink() || !destinationInfo.isDirectory()) {
    throw new Error(`Cannot migrate Agent UI data over an existing entry: ${destination}`);
  }

  for (const child of await readdir(source, { withFileTypes: true })) {
    const sourceChild = path.join(source, child.name);
    const destinationChild = path.join(destination, child.name);
    const sourceInfo = await lstat(sourceChild);
    const destinationChildInfo = await entry(destinationChild);
    if (!destinationChildInfo) {
      await rename(sourceChild, destinationChild);
      continue;
    }
    if (sourceInfo.isDirectory() && !sourceInfo.isSymbolicLink() && destinationChildInfo.isDirectory() && !destinationChildInfo.isSymbolicLink()) {
      await mergeDirectory(sourceChild, destinationChild);
      continue;
    }
    if (child.name === ".gitignore" && sourceInfo.isFile() && destinationChildInfo.isFile()) {
      await mergeIgnoreFile(sourceChild, destinationChild);
      continue;
    }
    if (sourceInfo.isFile() && !sourceInfo.isSymbolicLink() && destinationChildInfo.isFile() &&
        (await readFile(sourceChild)).equals(await readFile(destinationChild))) {
      await unlink(sourceChild);
      continue;
    }
    throw new Error(`Agent UI metadata migration found different files at ${destinationChild}`);
  }
  await rmdir(source);
}

const migrations = new Map<string, Promise<void>>();

/** Moves legacy Agent UI and Creator data into the canonical .agent-ui directory. */
export function migrateLegacyAgentUIMetadata(projectRoot: string): Promise<void> {
  const key = path.resolve(projectRoot);
  const active = migrations.get(key);
  if (active) return active;

  const migration = (async () => {
    const root = await realpath(projectRoot);
    const legacy = path.join(root, LEGACY_ROOT);
    const legacyCreator = path.join(root, LEGACY_CREATOR_ROOT);
    const legacyInfo = await entry(legacy);
    const legacyCreatorInfo = await entry(legacyCreator);
    if (!legacyInfo && !legacyCreatorInfo) return;
    if (legacyInfo) await assertRegularTree(legacy);
    if (legacyCreatorInfo) await assertRegularTree(legacyCreator);

    const current = path.join(root, CURRENT_ROOT);
    const currentInfo = await entry(current);
    if (currentInfo?.isSymbolicLink() || (currentInfo && !currentInfo.isDirectory())) {
      throw new Error(`Agent UI metadata must be a regular directory: ${current}`);
    }
    if (!currentInfo && legacyInfo) {
      await rename(legacy, current);
    } else {
      if (!currentInfo) await mkdir(current);
      if (legacyInfo) await mergeDirectory(legacy, current);
    }
    if (legacyCreatorInfo) await mergeDirectory(legacyCreator, path.join(current, "creator"));
  })();
  migrations.set(key, migration);
  void migration.finally(() => {
    if (migrations.get(key) === migration) migrations.delete(key);
  }).catch(() => undefined);
  return migration;
}
