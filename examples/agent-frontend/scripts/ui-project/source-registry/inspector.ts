import { lstat, readFile } from "node:fs/promises";
import path from "node:path";

import {
  loadAgentUISourceRegistry,
  type LoadedAgentUISourceItem,
  type LoadedAgentUISourceRegistry,
} from "@agent-ui/source-registry";

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

function exactVersion(
  value: string | undefined,
  allowPartial = false,
): [number, number, number] | undefined {
  const match = value?.match(
    allowPartial
      ? /^(?:npm:)?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+].*)?$/
      : /^(?:npm:)?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/,
  );
  return match === null || match === undefined
    ? undefined
    : [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

function compareVersion(
  left: [number, number, number],
  right: [number, number, number],
): number {
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

export function satisfiesAgentUIPackageRange(
  installed: string | undefined,
  range: string,
): boolean {
  const current = exactVersion(installed);
  if (current === undefined) return false;
  const comparators = range.trim().split(/\s+/);
  return comparators.every((comparator) => {
    const match = comparator.match(
      /^(>=|<=|>|<|\^|~)?(\d+(?:\.\d+){0,2}(?:[-+].*)?)$/,
    );
    if (match === null) return false;
    const wanted = exactVersion(match[2], true);
    if (wanted === undefined) return false;
    const comparison = compareVersion(current, wanted);
    switch (match[1] ?? "=") {
      case ">=": return comparison >= 0;
      case "<=": return comparison <= 0;
      case ">": return comparison > 0;
      case "<": return comparison < 0;
      case "^": return current[0] === wanted[0] && comparison >= 0;
      case "~": return current[0] === wanted[0] && current[1] === wanted[1] && comparison >= 0;
      default: return comparison === 0;
    }
  });
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
    for (const required of [...ranges].sort()) {
      const installed = versions[name];
      const compatible = satisfiesAgentUIPackageRange(installed, required);
      packages.push({ name, required, ...(installed === undefined ? {} : { installed }), compatible });
      if (!compatible) {
        issues.push({
          code: installed === undefined ? "AGENT_UI_PACKAGE_MISSING" : "AGENT_UI_PACKAGE_INCOMPATIBLE",
          message:
            installed === undefined
              ? `Agent UI source requires package ${name} ${required}.`
              : `Agent UI source requires ${name} ${required}, but package.json declares ${installed}.`,
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
  const packageInspection = await inspectAgentUIPackages(projectRoot, loadedRegistry.items);
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
