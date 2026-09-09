export type AgentUISourceItemKind =
  | "foundation"
  | "primitive"
  | "agent-component";

export interface AgentUISourceFile {
  source: string;
  target: string;
}

export interface AgentUISourceItem {
  schemaVersion: 1;
  id: string;
  version: string;
  kind: AgentUISourceItemKind;
  description: string;
  requires?: string[];
  packages?: Record<string, string>;
  files: AgentUISourceFile[];
}

export interface AgentUISourceRegistryManifest {
  schemaVersion: 1;
  items: Array<{
    id: string;
    path: string;
  }>;
}

export interface LoadedAgentUISourceFile extends AgentUISourceFile {
  absolutePath: string;
  content: Buffer;
}

export interface LoadedAgentUISourceItem extends AgentUISourceItem {
  itemRoot: string;
  manifestPath: string;
  loadedFiles: LoadedAgentUISourceFile[];
}

export interface LoadedAgentUISourceRegistry {
  root: string;
  items: LoadedAgentUISourceItem[];
  byId: ReadonlyMap<string, LoadedAgentUISourceItem>;
}
