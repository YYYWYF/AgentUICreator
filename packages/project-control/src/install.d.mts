export const MANAGED_CONTROL_ENTRY: ".agent-ui/control/project-control.mjs";
export const CONTROL_PROTOCOL_VERSION: 3;
export const CONTROL_RUNTIME_VERSION: 1;
export function installManagedProjectControl(projectRoot: string, options?: { upgrade?: boolean }): Promise<string[]>;
export function ensureManagedProjectControl(projectRoot: string, options?: { managed?: boolean }): Promise<string[]>;
