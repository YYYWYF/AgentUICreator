import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { intersects, validRange, Range } from "semver";
import { OfficialResourceError, type LoadedAgentUISourceItem } from "@agent-ui/source-registry";
import { inspectAgentUIPackages } from "./source-registry/inspector";

export interface ResourcePackageRequirement {
  name: string;
  required: string;
  declared?: string;
  installed?: string;
  compatible: boolean;
}

/** A compatible declaration with absent node_modules is repairable, not a conflict. */
export function resourcePackageConflicts(packages: readonly ResourcePackageRequirement[]): ResourcePackageRequirement[] {
  return packages.filter(item =>
    (item.installed !== undefined && !item.compatible) ||
    // Local/workspace/alias declarations are checked against the resolved version.
    // Preserve them verbatim rather than misclassifying them as semver conflicts.
    (item.declared !== undefined && validRange(item.declared) !== null && !intersects(item.declared, item.required)));
}

export interface ResourcePackageCommand { command: string; args: string[] }
export type ResourcePackageRunner = (projectRoot: string, command: ResourcePackageCommand) => Promise<void>;

export async function detectResourcePackageManager(projectRoot: string): Promise<"pnpm" | "yarn" | "npm" | "bun"> {
  return await packageManagerAt(path.resolve(projectRoot)) ?? "npm";
}

async function packageManagerAt(projectRoot: string, inherited = false): Promise<"pnpm" | "yarn" | "npm" | "bun" | undefined> {
  const exists = async (file: string) => access(path.join(projectRoot, file)).then(() => true, error => {
    if (error.code === "ENOENT") return false; throw error;
  });
  if (!await exists("package.json")) return undefined;
  const manifest = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8")) as { packageManager?: unknown };
  const workspace = await exists("pnpm-workspace.yaml") || "workspaces" in manifest;
  if (inherited && !workspace) return undefined;
  if (manifest.packageManager !== undefined) {
    if (typeof manifest.packageManager !== "string" || !/^(pnpm|yarn|npm|bun)@[^\s]+$/.test(manifest.packageManager)) throw new OfficialResourceError("RESOURCE_INSTALL_FAILED", "Unsupported project packageManager.", manifest.packageManager);
    return manifest.packageManager.split("@", 1)[0] as "pnpm" | "yarn" | "npm" | "bun";
  }
  const detected = new Set<"pnpm" | "yarn" | "npm" | "bun">();
  for (const [file, manager] of [["pnpm-lock.yaml", "pnpm"], ["yarn.lock", "yarn"], ["package-lock.json", "npm"], ["bun.lock", "bun"], ["bun.lockb", "bun"]] as const) {
    try { await access(path.join(projectRoot, file)); detected.add(manager); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  if (detected.size > 1) throw new OfficialResourceError("RESOURCE_CONFLICT", "Multiple package manager lockfiles; select a packageManager in package.json.", [...detected]);
  if (detected.size) return [...detected][0];
  if (inherited) return undefined;
  // Workspace children normally have neither packageManager nor a private lockfile.
  // Find the enclosing workspace, but do not adopt an unrelated ancestor's lockfile.
  for (let directory = path.dirname(projectRoot); directory !== path.dirname(directory); directory = path.dirname(directory)) {
    const manager = await packageManagerAt(directory, true);
    if (manager !== undefined) return manager;
  }
  return undefined;
}

export const runResourcePackageCommand: ResourcePackageRunner = async (projectRoot, { command, args }) => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, stdio: ["ignore", "pipe", "pipe"], shell: false });
    let output = "";
    const capture = (chunk: Buffer) => { output = (output + chunk.toString()).slice(-16_000); };
    child.stdout.on("data", capture); child.stderr.on("data", capture);
    const timer = setTimeout(() => { child.kill(); reject(new OfficialResourceError("RESOURCE_INSTALL_FAILED", "Package installation timed out.", output)); }, 300_000);
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("close", code => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new OfficialResourceError("RESOURCE_INSTALL_FAILED", "Package installation failed.", { command, args, code, output }));
    });
  });
};

/** Intersect all closure ranges; never pick the last declaration and lose a constraint. */
function combinedPackageRange(ranges: readonly string[]): string {
  let alternatives = [""];
  for (const range of ranges) {
    const sets = new Range(range).set.map(set => set.map(comparator => comparator.value).filter(Boolean).join(" "));
    alternatives = alternatives.flatMap(left => sets.map(right => `${left} ${right}`.trim()))
      .filter(candidate => intersects(candidate || "*", candidate || "*"));
  }
  if (!alternatives.length) throw new OfficialResourceError("RESOURCE_CONFLICT", "Source package requirements have no compatible version.", ranges);
  return alternatives.map(range => range || "*").join(" || ");
}

/** Adds only absent declarations. Existing direct dependencies are never silently upgraded. */
export async function ensureResourcePackages(projectRoot: string, closure: readonly LoadedAgentUISourceItem[], run: ResourcePackageRunner = runResourcePackageCommand): Promise<void> {
  const before = await inspectAgentUIPackages(projectRoot, closure);
  const manifest = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8")) as Record<string, unknown>;
  const fields = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"].map(field => (manifest[field] ?? {}) as Record<string, string>);
  const declarations = Object.assign({}, ...fields) as Record<string, string>;
  const packages = before.packages.flatMap(item => {
    const declared = fields.flatMap(field => field[item.name] === undefined ? [] : [field[item.name]!]);
    return declared.length ? declared.map(declared => ({ ...item, declared })) : [item];
  });
  const conflicts = resourcePackageConflicts(packages);
  if (conflicts.length || before.issues.some(issue => issue.code === "AGENT_UI_PACKAGE_INCOMPATIBLE")) throw new OfficialResourceError("RESOURCE_CONFLICT", "Resource dependency conflicts with the current project.", { conflicts, issues: before.issues });
  const byName = new Map<string, ResourcePackageRequirement[]>();
  for (const item of packages) byName.set(item.name, [...(byName.get(item.name) ?? []), item]);
  const additions: string[] = [];
  let restore = false;
  for (const [name, requirements] of byName) {
    const range = combinedPackageRange([...new Set(requirements.map(item => item.required))]);
    if (declarations[name] === undefined) additions.push(`${name}@${range}`);
    else {
      combinedPackageRange([...new Set([...requirements.map(item => item.required), ...requirements.flatMap(item => item.declared && validRange(item.declared) ? [item.declared] : [])])]);
      if (requirements.some(item => !item.compatible)) restore = true;
    }
  }
  if (!additions.length && !restore) return;
  const manager = await detectResourcePackageManager(projectRoot);
  const command = manager;
  const args = additions.length ? [manager === "npm" ? "install" : "add", ...(manager === "npm" ? ["--save"] : []), ...additions] : ["install"];
  if (manager === "pnpm" && additions.length) {
    try { await access(path.join(projectRoot, "pnpm-workspace.yaml")); args.splice(1, 0, "--workspace-root"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  await run(projectRoot, { command, args });
  const after = await inspectAgentUIPackages(projectRoot, closure);
  if (after.packages.some(item => !item.compatible)) throw new OfficialResourceError("RESOURCE_INSTALL_FAILED", "Resource package requirements remain unmet after installation.", after);
}
