export type {
  AgentUISourceFileInspection,
  AgentUISourceInspection,
  AgentUISourceIssue,
  AgentUISourceItemInspection,
  AgentUISourcePackageInspection,
  AgentUISourceStatus,
} from "../types";

export interface AgentUISourceLock {

  sourceRoot: string;
  items: Record<string, AgentUISourceLockItem>;
}

export interface AgentUISourceLockItem {
  files: Record<string, { sha256: string }>;
}

export interface AgentUISourceTransactionOriginalEntry {
  path: string;
  contentBase64: string | null;
}

export interface AgentUISourceTransactionJournal {

  itemId: string;
  originals: AgentUISourceTransactionOriginalEntry[];
  lockContentBase64: string | null;
}

export interface AgentUISourceApplyResult {

  itemId: string;
  changed: boolean;
  changedItems: string[];
  changedPaths: string[];
  stateHash: string;
}
