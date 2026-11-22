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
  /** One-time example imports: paths only, no official implementation baseline. */
  examples?: Record<string, { files: string[] }>;
}

export interface AgentUISourceLockItem {
  /** Imported versions describe provenance, not the current implementation. */
  pluginVersion?: string;
  sourceRelease?: string;
  /** Installation receipt only. Current project files are authoritative. */
  files: Record<string, Record<string, never>>;
}

export interface AgentUISourceTransactionOriginalEntry {
  path: string;
  contentBase64: string | null;
}

export interface AgentUISourceTransactionJournal {

  ownershipContentBase64?: string | null;
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
