import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { AgentUISourceError } from "./source-registry/path-policy";

/** Enumerate actual implementation files, including files added by other agents. */
export async function readCurrentPluginSource(directory: string): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  async function walk(relative: string): Promise<void> {
    const native = path.join(directory, ...relative.split("/"));
    const entries = await readdir(native, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const file = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new AgentUISourceError("PLUGIN_SOURCE_SYMLINK", "Implementation files cannot traverse symbolic links.");
      if (entry.isDirectory()) await walk(file);
      else files.set(file, await readFile(path.join(directory, ...file.split("/"))));
    }
  }
  await walk("");
  return files;
}

export function currentPluginVersion(manifest: Buffer | undefined): string | null {
  if (!manifest?.length) return null;
  const value: unknown = JSON.parse(manifest.toString("utf8"));
  return value && typeof value === "object" && "version" in value && typeof value.version === "string"
    ? value.version : null;
}
