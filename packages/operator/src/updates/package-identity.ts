import path from "node:path";
import { readFile, realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { valid } from "semver";

export interface InstalledPackageIdentity { name: string; version: string; declared?: string; root: string }
export async function readPackageIdentity(start: string, name: string): Promise<InstalledPackageIdentity | undefined> {
  const origin = path.resolve(start);
  const own = await readFile(path.join(origin, "package.json"), "utf8").then(JSON.parse).catch(error => { if(error.code === "ENOENT") return undefined; throw error; });
  const declared = own?.dependencies?.[name] ?? own?.devDependencies?.[name] ?? own?.optionalDependencies?.[name] ?? own?.peerDependencies?.[name];
  for (let directory = origin;; directory = path.dirname(directory)) {
    for (const root of [...(directory === origin && own?.name === name ? [origin] : []), path.join(directory, "node_modules", ...name.split("/"))]) {
      let pkg;
      try { pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")); }
      catch(error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
      if (pkg.name !== name || !valid(pkg.version)) throw new Error("UPDATE_INSTALLED_IDENTITY_INVALID");
      return { name, version: pkg.version, root: await realpath(root), ...(typeof declared === "string" ? {declared} : {}) };
    }
    if (directory === path.dirname(directory)) return undefined;
  }
}
export async function ownPackageIdentity(name: string) {
  for (let directory = path.dirname(fileURLToPath(import.meta.url));; directory = path.dirname(directory)) {
    const pkg = await readFile(path.join(directory,"package.json"),"utf8").then(JSON.parse).catch(error=>{if(error.code==="ENOENT")return undefined;throw error;});
    if(pkg?.name===name && valid(pkg.version))return {name,version:pkg.version as string,root:directory};
    if(directory===path.dirname(directory))throw new Error("UPDATE_TOOL_IDENTITY_UNAVAILABLE");
  }
}
