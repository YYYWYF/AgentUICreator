export const MANAGED_OPERATOR_ENTRY: ".agent-ui/operator/entry.mjs";
export function installManagedOperator(projectRoot: string, options?: { upgrade?: boolean }): Promise<string[]>;
export function ensureManagedOperator(projectRoot: string): Promise<string[]>;
