import { readdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { CreatorWorkspaceError } from "./CreatorWorkspaceManager.js";
import type { CreatorWorkspaceDirectoryListing } from "./types.js";

function breadcrumbs(directory: string): CreatorWorkspaceDirectoryListing["breadcrumbs"] {
  const root = path.parse(directory).root;
  const parts = directory.slice(root.length).split(path.sep).filter(Boolean);
  const result: { label: string; path: string }[] = [{ label: root, path: root }];
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    result.push({ label: part, path: current });
  }
  return result;
}

/** Browse directories on the local Creator host without changing the selected project. */
export async function browseProjectDirectories(
  requestedPath: string | undefined,
  startPath: string,
): Promise<CreatorWorkspaceDirectoryListing> {
  try {
    const directory = await realpath(requestedPath ?? startPath);
    if (!(await stat(directory)).isDirectory()) {
      throw new CreatorWorkspaceError("CREATOR_WORKSPACE_NOT_DIRECTORY", "请选择文件夹。");
    }
    const entries = await readdir(directory, { withFileTypes: true });
    const folders = await Promise.all(entries.map(async (entry) => {
      if (entry.isDirectory()) return entry.name;
      if (!entry.isSymbolicLink()) return undefined;
      try { return (await stat(path.join(directory, entry.name))).isDirectory() ? entry.name : undefined; }
      catch { return undefined; }
    }));
    return {
      path: directory,
      parentPath: path.dirname(directory) === directory ? null : path.dirname(directory),
      homePath: await realpath(homedir()),
      startPath: await realpath(startPath),
      breadcrumbs: breadcrumbs(directory),
      directories: folders.filter((name): name is string => name !== undefined)
        .sort((a, b) => Number(a.startsWith(".")) - Number(b.startsWith(".")) ||
          a.localeCompare(b, undefined, { sensitivity: "base" }))
        .map((name) => ({ name, path: path.join(directory, name) })),
    };
  } catch (error) {
    if (error instanceof CreatorWorkspaceError) throw error;
    throw new CreatorWorkspaceError(
      "CREATOR_WORKSPACE_DIRECTORY_UNAVAILABLE",
      "无法读取这个文件夹。请返回上级目录或使用手动路径入口。",
    );
  }
}
