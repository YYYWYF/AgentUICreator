export interface ThemeChange { path: string; before: string; after: string; verificationRuntime: string }
export interface ThemeVerification { status: "passed" | "failed"; errors: { code: string; message: string }[]; warnings: { code: string; message: string }[] }
export interface CommandMutationResult {
  current: string; changed: boolean; changedPaths: string[]; validation: "passed"; runId?: string; verification: ThemeVerification;
}

export function synchronizeAgentUIPluginRegistry(root: string): Promise<{ changed: boolean; path: string; pluginIds: string[] }>;

export function getAgentUIPluginInstances(root: string): Promise<{ id: string; pluginId: string; enabled: boolean }[]>;
export function planAgentUIPluginRegistry(root: string, modelSource: string): Promise<{ path: string; before: string; after: string }>;
export function setAgentUIPluginEnabled(root: string, instanceId: string, enabled: boolean, commit: (change: ThemeChange) => Promise<{ runId?: string; verification: ThemeVerification }>): Promise<CommandMutationResult>;

export function getAgentUIAvailablePluginIds(root: string): Promise<string[]>;

export interface PluginEnablementPreparation {
  pluginId: string; stateHash: string; files: string[];
  packages: { name: string; required: string; declared?: string; installed?: string }[];
}
export function preparePluginEnablement(root: string, pluginId: string): Promise<PluginEnablementPreparation>;
export function completePluginEnablement(root: string, expected: PluginEnablementPreparation): Promise<{ changed: boolean; createdPaths: string[] }>;
