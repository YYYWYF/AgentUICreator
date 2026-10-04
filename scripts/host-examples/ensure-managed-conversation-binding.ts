import { readFile } from "node:fs/promises";
import path from "node:path";

import { loadAgentUISourceRegistry } from "@agent-ui/source-registry";
import { readAgentUISourceLock, serializeAgentUISourceLock, sha256 } from "../../packages/project-control/src/project/source-registry/lock";
import { commitAgentUISourceTransaction, recoverPendingAgentUISourceTransaction } from "../../packages/project-control/src/project/source-registry/transaction";
import { uiProjectControlConfig } from "../../packages/project-control/src/project/project-config";

const itemId = "foundation/core-adapters";
const target = "agent-ui/conversation/threads/conversation-service-thread-binding.ts";

/** Keep this managed demo seam current even when unrelated Host files customize its Source Item. */
export async function ensureManagedConversationBinding(projectRoot: string): Promise<void> {
  const config = {
    ...uiProjectControlConfig,
    agentUI: { sourceRoot: "src/agent-ui", metadataRoot: ".agent-ui" },
  };
  await recoverPendingAgentUISourceTransaction(projectRoot, config);
  const registry = await loadAgentUISourceRegistry();
  const item = registry.byId.get(itemId);
  const source = item?.loadedFiles.find(file => file.target === target);
  if (item === undefined || source === undefined) throw new Error(`Missing managed source: ${itemId}/${target}`);

  const { lock } = await readAgentUISourceLock(projectRoot, config);
  const managedHash = lock.items[itemId]?.files[target]?.sha256;
  if (managedHash === undefined) return;
  const current = await readFile(path.join(projectRoot, config.agentUI.sourceRoot, target));
  if (sha256(current) !== managedHash) {
    console.warn(`Preserving customized Host source: ${target}`);
    return;
  }
  const nextHash = sha256(source.content);
  if (nextHash === managedHash) return;

  const nextLock = structuredClone(lock);
  nextLock.items[itemId]!.files[target] = { sha256: nextHash };
  await commitAgentUISourceTransaction(projectRoot, config, itemId, item.version,
    [{ target, content: source.content }], serializeAgentUISourceLock(nextLock));
}
