export type {
  AgentUISourceFileInspection,
  AgentUISourceInspection,
  AgentUISourceIssue,
  AgentUISourceItemInspection,
  AgentUISourcePackageInspection,
  AgentUISourceStatus,
} from "../types";

export interface AgentUISourceLock {
  schemaVersion: 1;
  sourceRoot: string;
  items: Record<string, AgentUISourceLockItem>;
}

export interface AgentUISourceLockItem {
  version: string;
  files: Record<string, { sha256: string }>;
}

export interface AgentUISourceTransactionOriginalEntry {
  path: string;
  contentBase64: string | null;
}

export interface AgentUISourceTransactionJournal {
  schemaVersion: 1;
  itemId: string;
  targetVersion: string;
  originals: AgentUISourceTransactionOriginalEntry[];
  lockContentBase64: string | null;
}

export interface AgentUISourceApplyResult {
  schemaVersion: 1;
  itemId: string;
  changed: boolean;
  changedItems: string[];
  changedPaths: string[];
  stateHash: string;
}
