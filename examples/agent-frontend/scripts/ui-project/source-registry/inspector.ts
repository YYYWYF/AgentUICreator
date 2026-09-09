import { lstat, readFile } from "node:fs/promises";
import path from "node:path";

import {
  loadAgentUISourceRegistry,
  type LoadedAgentUISourceItem,
  type LoadedAgentUISourceRegistry,
} from "@agent-ui/source-registry";
import { satisfies as satisfiesSemver } from "semver";

import { uiProjectControlConfig } from "../project-config";
import type {
  AgentUISourceFileInspection,
  AgentUISourceInspection,
  AgentUISourceIssue,
  AgentUISourceItemInspection,
  AgentUISourcePackageInspection,
  AgentUISourceStatus,
  UIProjectControlConfig,
} from "../types";
import { readAgentUISourceLock, sha256 } from "./lock";
import {
  AgentUISourceError,
  assertNoSymbolicLinkTraversal,
  resolveAgentUISourceRoots,
} from "./path-policy";

async function inspectFile(
  sourceRoot: string,
  sourceRootName: string,
  target: string,
  managedSha256?: string,
): Promise<AgentUISourceFileInspection> {
  const absolutePath = path.join(sourceRoot, target);
  try {
    await assertNoSymbolicLinkTraversal(sourceRoot, target);
    const fileStat = await lstat(absolutePath);
    if (!fileStat.isFile()) {
      return {
        path: path.posix.join(sourceRootName, target),
        status: managedSha256 === undefined ? "blocked" : "customized",
        ...(managedSha256 === undefined ? {} : { managedSha256 }),
      };
    }
    const currentSha256 = sha256(await readFile(absolutePath));
    return {
      path: path.posix.join(sourceRootName, target),
      status:
        managedSha256 === undefined
          ? "blocked"
          : currentSha256 === managedSha256
            ? "managed"
            : "customized",
      currentSha256,
      ...(managedSha256 === undefined ? {} : { managedSha256 }),
    };
  } catch (error) {
    if (error instanceof AgentUISourceError) {
      return {
        path: path.posix.join(sourceRootName, target),
        status: managedSha256 === undefined ? "blocked" : "customized",
        ...(managedSha256 === undefined ? {} : { managedSha256 }),
      };
    }
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return {
      path: path.posix.join(sourceRootName, target),
      status: managedSha256 === undefined ? "not-installed" : "partial",
      ...(managedSha256 === undefined ? {} : { managedSha256 }),
    };
  }
}

function aggregateStatus(
  hasLock: boolean,
  files: AgentUISourceFileInspection[],
): AgentUISourceStatus {
  if (files.some((file) => file.status === "partial")) return "partial";
  if (files.some((file) => file.status === "customized")) return "customized";
  if (files.some((file) => file.status === "blocked")) return "blocked";
  if (!hasLock) return "not-installed";
  return "managed";
}

export function satisfiesAgentUIPackageRange(
  installed: string | undefined,
  range: string,
): boolean {
  return installed !== undefined && satisfiesSemver(installed, range);
}

function dependencyVersions(packageJson: unknown): Record<string, string> {
  if (typeof packageJson !== "object" || packageJson === null || Array.isArray(packageJson)) return {};
  const result: Record<string, string> = {};
  for (const field of ["dependencies", "devDependencies"]) {
    const value = (packageJson as Record<string, unknown>)[field];
    if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
    for (const [name, version] of Object.entries(value)) {
      if (typeof version === "string") result[name] = version;
    }
  }
  return result;
}

async function installedPackageVersion(
  projectRoot: string,
  packageName: string,
): Promise<{ exists: boolean; version?: string }> {
  const packagePath = path.join(
    projectRoot,
    "node_modules",
    ...packageName.split("/"),
    "package.json",
  );
  try {
    const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as unknown;
    const version =
      typeof packageJson === "object" &&
      packageJson !== null &&
      !Array.isArray(packageJson) &&
      typeof (packageJson as Record<string, unknown>).version === "string"
        ? (packageJson as Record<string, string>).version
        : undefined;
    return { exists: true, ...(version === undefined ? {} : { version }) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { exists: false };
    }
    throw error;
  }
}

export async function inspectAgentUIPackages(
  projectRoot: string,
  items: readonly LoadedAgentUISourceItem[],
): Promise<{ packages: AgentUISourcePackageInspection[]; issues: AgentUISourceIssue[] }> {
  const packageJson = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8")) as unknown;
  const versions = dependencyVersions(packageJson);
  const requirements = new Map<string, Set<string>>();
  for (const item of items) {
    for (const [name, range] of Object.entries(item.packages ?? {})) {
      const ranges = requirements.get(name) ?? new Set<string>();
      ranges.add(range);
      requirements.set(name, ranges);
    }
  }
  const packages: AgentUISourcePackageInspection[] = [];
  const issues: AgentUISourceIssue[] = [];
  for (const [name, ranges] of [...requirements].sort(([left], [right]) => left.localeCompare(right))) {
    const declared = versions[name];
    const installedPackage = await installedPackageVersion(projectRoot, name);
    for (const required of [...ranges].sort()) {
      const installed = installedPackage.version;
      const compatible = satisfiesAgentUIPackageRange(installed, required);
      packages.push({
        name,
        required,
        ...(declared === undefined ? {} : { declared }),
        ...(installed === undefined ? {} : { installed }),
        compatible,
      });
      if (!compatible) {
        const missing = !installedPackage.exists;
        issues.push({
          code: missing ? "AGENT_UI_PACKAGE_MISSING" : "AGENT_UI_PACKAGE_INCOMPATIBLE",
          message:
            missing
              ? `Agent UI source requires package ${name} ${required}.`
              : installed === undefined
                ? `Agent UI source requires ${name} ${required}, but its installed package has no valid version.`
                : `Agent UI source requires ${name} ${required}, but node_modules contains ${installed}.`,
          packageName: name,
        });
      }
    }
  }
  return { packages, issues };
}

export async function inspectAgentUISources(
  projectRoot: string,
  config: UIProjectControlConfig = uiProjectControlConfig,
  registry?: LoadedAgentUISourceRegistry,
): Promise<AgentUISourceInspection> {
  const loadedRegistry = registry ?? await loadAgentUISourceRegistry();
  const { sourceRoot } = await resolveAgentUISourceRoots(projectRoot, config);
  const { lock } = await readAgentUISourceLock(projectRoot, config);
  const items: AgentUISourceItemInspection[] = [];
  const issues: AgentUISourceIssue[] = [];

  for (const item of loadedRegistry.items) {
    const locked = lock.items[item.id];
    const targets = new Set([
      ...item.files.map((file) => file.target),
      ...Object.keys(locked?.files ?? {}),
    ]);
    const files = await Promise.all(
      [...targets].sort().map((target) =>
        inspectFile(
          sourceRoot,
          config.agentUI.sourceRoot,
          target,
          locked?.files[target]?.sha256,
        ),
      ),
    );
    const status = aggregateStatus(locked !== undefined, files);
    const packageInspection = await inspectAgentUIPackages(projectRoot, [item]);
    const itemIssues: AgentUISourceIssue[] = [];
    if (status !== "managed" && status !== "not-installed") {
      itemIssues.push({
        code:
          status === "customized"
            ? "AGENT_UI_SOURCE_CUSTOMIZED"
            : status === "partial"
              ? "AGENT_UI_SOURCE_PARTIAL"
              : "AGENT_UI_SOURCE_PATH_CONFLICT",
        message: `Agent UI source item ${item.id} is ${status}.`,
        itemId: item.id,
      });
    }
    items.push({
      id: item.id,
      ...(locked === undefined ? {} : { installedVersion: locked.version }),
      availableVersion: item.version,
      status,
      files,
      requirements: packageInspection.packages,
      issues: itemIssues,
    });
    issues.push(...itemIssues);
  }

  for (const itemId of Object.keys(lock.items).sort()) {
    if (!loadedRegistry.byId.has(itemId)) {
      issues.push({
        code: "AGENT_UI_SOURCE_ITEM_UNAVAILABLE",
        message: `Managed Agent UI source item ${itemId} is not available in this Registry.`,
        itemId,
      });
    }
  }
  const installedItems = new Map<string, LoadedAgentUISourceItem>();
  const visitInstalled = (item: LoadedAgentUISourceItem): void => {
    if (installedItems.has(item.id)) return;
    installedItems.set(item.id, item);
    for (const requiredId of item.requires ?? []) {
      const required = loadedRegistry.byId.get(requiredId);
      if (required !== undefined) visitInstalled(required);
    }
  };
  for (const itemId of Object.keys(lock.items)) {
    const item = loadedRegistry.byId.get(itemId);
    if (item !== undefined) visitInstalled(item);
  }
  const packageInspection = await inspectAgentUIPackages(
    projectRoot,
    [...installedItems.values()],
  );
  issues.push(...packageInspection.issues);
  const body = {
    sourceRoot: config.agentUI.sourceRoot,
    metadataRoot: config.agentUI.metadataRoot,
    items,
    packages: packageInspection.packages,
    issues,
  };
  return { stateHash: sha256(JSON.stringify(body)), ...body };
}

export function agentUISourceSummary(inspection: AgentUISourceInspection) {
  return {
    stateHash: inspection.stateHash,
    sourceRoot: inspection.sourceRoot,
    metadataRoot: inspection.metadataRoot,
    managedItems: inspection.items.filter((item) => item.status === "managed").length,
    customizedItems: inspection.items.filter((item) => item.status === "customized").length,
    issues: inspection.issues,
  };
}

export function asAgentUISourceError(error: unknown): AgentUISourceError {
  if (error instanceof AgentUISourceError) return error;
  if (typeof error === "object" && error !== null && "code" in error && "message" in error) {
    return error as AgentUISourceError;
  }
  return new AgentUISourceError(
    "AGENT_UI_SOURCE_INSPECTION_FAILED",
    error instanceof Error ? error.message : String(error),
  );
}
