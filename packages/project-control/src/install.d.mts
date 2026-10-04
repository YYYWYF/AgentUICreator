export const MANAGED_CONTROL_ENTRY: ".agent-ui/control/project-control.mjs";
export function installManagedProjectControl(projectRoot: string, options?: { upgrade?: boolean }): Promise<string[]>;
export function ensureManagedProjectControl(projectRoot: string): Promise<string[]>;
