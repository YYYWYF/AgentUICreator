import { randomUUID } from "node:crypto";
import { readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { officialPackageNames } from "./compatibility-release.js";
import { PackageUpdateService, type PackageCompatibilityIssue } from "./package-update-service.js";
import type { CompatibilityReleaseProvider } from "./release-provider.js";
import { runUpdateCommand, type UpdateCommand } from "./npm-artifact.js";
import { detectResourcePackageManager, type ResourcePackageManager } from "../project/ensure-resource-packages.js";
import { acquireOperatorLock } from "../project/operator-lock.js";

const journalName = ".agent-ui-npm-update.json";
const optional = async (file: string) => readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
  if (error.code === "ENOENT") return null;
  throw error;
});
const fields = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"] as const;
type DependencyField = typeof fields[number];
interface ProjectManifest {
  [key: string]: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}
export interface PackageUpgradePlan {
  id: string; releaseId: string; digest: string; manager: ResourcePackageManager; lockfile: string;
  packages: { name: string; current: string; target: string; integrity: string; field: string | null }[];
  checks: string[]; advisories?: PackageCompatibilityIssue[]; expiresAt: string;
}
export interface PackageUpgradeResult {
  status: "installed" | "restored" | "recovery-required"; checks: string[]; failure?: string; recoveryId?: string;
}
export type PackageUpgradeStage = "installing" | "checking" | "recovering";
interface Journal {
  schemaVersion: 1; id: string; root: string; manager: ResourcePackageManager;
  before: string; after: string; state: "installing" | "recovering" | "recovery-required";
}
interface Stored { root: string; plan: PackageUpgradePlan; before: string; after: string }
const active = new Set<string>();
const lockfiles: Record<ResourcePackageManager, string> = {
  npm: "package-lock.json", pnpm: "pnpm-lock.yaml", yarn: "yarn.lock", bun: "bun.lock",
};

/** Creator applies confirmed declarations; the package manager owns installation. */
export class PackageUpgradeService {
  private plans = new Map<string, Stored>();
  constructor(
    _provider: CompatibilityReleaseProvider,
    private overview: PackageUpdateService,
    private run: UpdateCommand = runUpdateCommand,
  ) {}
  async recovery(root: string): Promise<{ id: string; state: string } | null> {
    const raw = await optional(path.join(root, journalName));
    if (!raw) return null;
    const journal = JSON.parse(raw) as Journal;
    return { id: journal.id, state: journal.state };
  }
  async plan(projectRoot: string, targets?: Record<string, string>): Promise<PackageUpgradePlan> {
    const root = await realpath(projectRoot);
    const before = await readFile(path.join(root, "package.json"), "utf8");
    const manifest = JSON.parse(before) as ProjectManifest;
    const current = await this.overview.inspect(root, true).catch(() => undefined);
    const projectPackages = current?.packages.filter(pkg => pkg.scope === "project") ?? [];
    // Explicit targets remain usable with stale/unavailable discovery metadata.
    const selected = targets ?? Object.fromEntries(projectPackages
      .filter(pkg => pkg.updateAvailable && pkg.targetVersion)
      .map(pkg => [pkg.name, pkg.targetVersion!]));
    const packages: PackageUpgradePlan["packages"] = [];
    for (const [name, target] of Object.entries(selected)) {
      // Confirmation authorizes project Agent UI packages, never the tool Host.
      if (!officialPackageNames.includes(name) || name.endsWith("-creator") || typeof target !== "string" || !target.trim()) {
        throw new Error("PACKAGE_TARGET_INVALID");
      }
      const declared = fields.filter(field => manifest[field]?.[name] !== undefined);
      const field: DependencyField = declared[0] ?? "dependencies";
      const previous = projectPackages.find(pkg => pkg.name === name);
      packages.push({ name, current: previous?.currentVersion ?? manifest[field]?.[name] ?? "", target, integrity: "", field });
      // Preserve existing dependency fields, including deliberate duplicate declarations.
      for (const owner of declared.length ? declared : [field]) manifest[owner] = { ...manifest[owner], [name]: target };
    }
    const manager = await detectResourcePackageManager(root);
    const plan: PackageUpgradePlan = {
      id: randomUUID(), releaseId: current?.recommendedReleaseId ?? "npm-metadata",
      digest: current?.digest ?? "", manager, lockfile: lockfiles[manager], packages,
      checks: [], advisories: current?.advisories.flatMap(entry => entry.issues) ?? [],
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    };
    const newline = before.includes("\r\n") ? "\r\n" : "\n";
    const indent = before.match(/\n([ \t]+)"/)?.[1] ?? "  ";
    const after = (JSON.stringify(manifest, null, indent) + "\n").replace(/\n/g, newline);
    for (const [id, stored] of this.plans) {
      if (stored.root === root || Date.parse(stored.plan.expiresAt) < Date.now()) this.plans.delete(id);
    }
    this.plans.set(plan.id, { root, plan, before, after });
    return plan;
  }
  async execute(projectRoot: string, id: string, onProgress?: (stage: PackageUpgradeStage) => void): Promise<PackageUpgradeResult> {
    const root = await realpath(projectRoot);
    const stored = this.plans.get(id);
    // Bind confirmation to its project and exact manifest write.
    if (!stored || stored.root !== root || Date.parse(stored.plan.expiresAt) < Date.now()) throw new Error("PACKAGE_PLAN_STALE");
    if (active.has(root)) throw new Error("PACKAGE_OPERATION_ACTIVE");
    active.add(root);
    let unlock: (() => Promise<void>) | undefined;
    try {
      unlock = await acquireOperatorLock(root);
      if (stored.before !== await readFile(path.join(root, "package.json"), "utf8")) throw new Error("PACKAGE_PLAN_STALE");
      const file = path.join(root, journalName);
      // A failed attempt must not disable a new attempt; retain its record separately.
      const previous = await optional(file);
      if (previous) await writeFile(path.join(root, `.agent-ui-npm-update.${randomUUID()}.json`), previous, { flag: "wx", mode: 0o600 });
      const journal: Journal = { schemaVersion: 1, id, root, manager: stored.plan.manager,
        before: stored.before, after: stored.after, state: "installing" };
      await this.save(root, journal);
      this.plans.delete(id);
      try {
        try { onProgress?.("installing"); } catch { /* Observers do not own installation. */ }
        await writeFile(path.join(root, "package.json"), stored.after);
        await this.run(root, stored.plan.manager, ["install"]);
        await rm(file);
        return { status: "installed", checks: [] };
      } catch (error) {
        // Do not validate or roll back the selected installation.
        journal.state = "recovery-required";
        await this.save(root, journal);
        return { status: "recovery-required", recoveryId: id, checks: [],
          failure: error instanceof Error ? error.message : "PACKAGE_COMMAND_FAILED" };
      }
    } finally {
      try { await unlock?.(); } finally { active.delete(root); }
    }
  }
  async recover(projectRoot: string, id: string): Promise<PackageUpgradeResult> {
    const root = await realpath(projectRoot);
    if (active.has(root)) throw new Error("PACKAGE_OPERATION_ACTIVE");
    active.add(root);
    let unlock: (() => Promise<void>) | undefined;
    try {
      unlock = await acquireOperatorLock(root);
      const raw = await optional(path.join(root, journalName));
      const journal = raw ? JSON.parse(raw) as Journal : null;
      if (!journal || journal.root !== root || journal.id !== id || typeof journal.before !== "string") throw new Error("PACKAGE_RECOVERY_INVALID");
      const manifest = await readFile(path.join(root, "package.json"), "utf8");
      if (manifest !== journal.before && manifest !== journal.after) throw new Error("PACKAGE_RECOVERY_CONCURRENT_EDIT");
      try {
        journal.state = "recovering";
        await this.save(root, journal);
        await writeFile(path.join(root, "package.json"), journal.before);
        await this.run(root, journal.manager, ["install"]);
        await rm(path.join(root, journalName));
        return { status: "restored", checks: [] };
      } catch (error) {
        journal.state = "recovery-required";
        await this.save(root, journal);
        return { status: "recovery-required", recoveryId: id, checks: [],
          failure: error instanceof Error ? error.message : "PACKAGE_COMMAND_FAILED" };
      }
    } finally {
      try { await unlock?.(); } finally { active.delete(root); }
    }
  }
  private async save(root: string, journal: Journal) {
    const file = path.join(root, journalName);
    await writeFile(file + ".tmp", JSON.stringify(journal), { mode: 0o600 });
    await rename(file + ".tmp", file);
  }
}
