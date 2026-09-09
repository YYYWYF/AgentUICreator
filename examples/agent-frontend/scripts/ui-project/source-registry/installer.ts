import {
  loadAgentUISourceRegistry,
  type LoadedAgentUISourceItem,
  type LoadedAgentUISourceRegistry,
} from "@agent-ui/source-registry";

import { uiProjectControlConfig } from "../project-config";
import type { UIProjectControlConfig } from "../types";
import {
  readAgentUISourceLock,
  serializeAgentUISourceLock,
  sha256,
} from "./lock";
import {
  inspectAgentUIPackages,
  inspectAgentUISources,
} from "./inspector";
import { AgentUISourceError } from "./path-policy";
import {
  commitAgentUISourceTransaction,
  recoverPendingAgentUISourceTransaction,
  type AgentUISourceFileMutation,
  type AgentUISourceTransactionTestOptions,
} from "./transaction";
import type { AgentUISourceApplyResult, AgentUISourceLock } from "./types";

export interface ApplyAgentUISourceItemInput {
  itemId: string;
  expectedStateHash: string;
}

function dependencyClosure(
  registry: LoadedAgentUISourceRegistry,
  itemId: string,
): LoadedAgentUISourceItem[] {
  const requested = registry.byId.get(itemId);
  if (requested === undefined) {
    throw new AgentUISourceError(
      "AGENT_UI_SOURCE_ITEM_NOT_FOUND",
      `Agent UI source item ${itemId} does not exist.`,
      { itemId },
    );
  }
  const result: LoadedAgentUISourceItem[] = [];
  const visited = new Set<string>();
  const visit = (item: LoadedAgentUISourceItem): void => {
    if (visited.has(item.id)) return;
    visited.add(item.id);
    for (const requiredId of item.requires ?? []) {
      const required = registry.byId.get(requiredId);
      if (required === undefined) {
        throw new AgentUISourceError(
          "AGENT_UI_SOURCE_REQUIREMENT_NOT_FOUND",
          `Agent UI source item ${item.id} requires unavailable item ${requiredId}.`,
        );
      }
      visit(required);
    }
    result.push(item);
  };
  visit(requested);
  return result;
}

function stateError(itemId: string, status: string): AgentUISourceError {
  const code =
    status === "customized"
      ? "AGENT_UI_SOURCE_CUSTOMIZED"
      : status === "partial"
        ? "AGENT_UI_SOURCE_PARTIAL"
        : "AGENT_UI_SOURCE_PATH_CONFLICT";
  return new AgentUISourceError(
    code,
    `Agent UI source item ${itemId} is ${status}; refusing to overwrite project source.`,
    { itemId, status },
  );
}

export async function applyAgentUISourceItem(
  projectRoot: string,
  input: ApplyAgentUISourceItemInput,
  config: UIProjectControlConfig = uiProjectControlConfig,
  registry?: LoadedAgentUISourceRegistry,
  testOptions: AgentUISourceTransactionTestOptions = {},
): Promise<AgentUISourceApplyResult> {
  await recoverPendingAgentUISourceTransaction(projectRoot, config);
  const loadedRegistry = registry ?? await loadAgentUISourceRegistry();
  const closure = dependencyClosure(loadedRegistry, input.itemId);
  const before = await inspectAgentUISources(projectRoot, config, loadedRegistry);
  if (before.stateHash !== input.expectedStateHash) {
    throw new AgentUISourceError(
      "AGENT_UI_SOURCE_STATE_CONFLICT",
      "Agent UI source state changed after inspection. Inspect again and retry.",
      { expectedStateHash: input.expectedStateHash, actualStateHash: before.stateHash },
    );
  }
  const byId = new Map(before.items.map((item) => [item.id, item]));
  for (const item of closure) {
    const inspection = byId.get(item.id);
    const status = inspection?.status;
    if (status === "blocked" || status === "partial") throw stateError(item.id, status);
    if (status === "customized" && item.id === input.itemId) throw stateError(item.id, status);
    if (
      status === "customized" &&
      item.id !== input.itemId &&
      inspection?.installedVersion !== item.version
    ) {
      throw new AgentUISourceError(
        "AGENT_UI_SOURCE_CUSTOMIZED_DEPENDENCY",
        `Agent UI source dependency ${item.id} was customized by the project and cannot be synchronized automatically; ${input.itemId} cannot be installed against a different dependency version.`,
        {
          requestedItemId: input.itemId,
          dependencyItemId: item.id,
          installedVersion: inspection?.installedVersion,
          requiredVersion: item.version,
        },
      );
    }
  }
  const packageInspection = await inspectAgentUIPackages(projectRoot, closure);
  const packageIssue = packageInspection.issues[0];
  if (packageIssue !== undefined) {
    throw new AgentUISourceError(packageIssue.code, packageIssue.message, packageIssue);
  }

  const { lock } = await readAgentUISourceLock(projectRoot, config);
  const nextLock: AgentUISourceLock = structuredClone(lock);
  const mutations = new Map<string, AgentUISourceFileMutation>();
  const changedItems: string[] = [];
  for (const item of closure) {
    const inspection = byId.get(item.id);
    if (inspection?.status === "customized") continue;
    if (inspection?.status === "managed" && inspection.installedVersion === item.version) continue;
    const previous = nextLock.items[item.id];
    const nextTargets = new Set(item.loadedFiles.map((file) => file.target));
    for (const oldTarget of Object.keys(previous?.files ?? {})) {
      if (!nextTargets.has(oldTarget)) mutations.set(oldTarget, { target: oldTarget });
    }
    for (const file of item.loadedFiles) {
      mutations.set(file.target, { target: file.target, content: file.content });
    }
    nextLock.items[item.id] = {
      version: item.version,
      files: Object.fromEntries(
        item.loadedFiles
          .map((file) => [file.target, { sha256: sha256(file.content) }] as const)
          .sort(([left], [right]) => left.localeCompare(right)),
      ),
    };
    changedItems.push(item.id);
  }

  if (changedItems.length === 0) {
    return {
      schemaVersion: 1,
      itemId: input.itemId,
      changed: false,
      changedItems: [],
      changedPaths: [],
      stateHash: before.stateHash,
    };
  }
  const orderedMutations = [...mutations.values()].sort((left, right) =>
    left.target.localeCompare(right.target),
  );
  await commitAgentUISourceTransaction(
    projectRoot,
    config,
    input.itemId,
    loadedRegistry.byId.get(input.itemId)!.version,
    orderedMutations,
    serializeAgentUISourceLock(nextLock),
    testOptions,
  );
  const after = await inspectAgentUISources(projectRoot, config, loadedRegistry);
  return {
    schemaVersion: 1,
    itemId: input.itemId,
    changed: true,
    changedItems,
    changedPaths: [
      ...orderedMutations.map((mutation) =>
        `${config.agentUI.sourceRoot}/${mutation.target}`,
      ),
      `${config.agentUI.metadataRoot}/source-lock.json`,
    ],
    stateHash: after.stateHash,
  };
}
