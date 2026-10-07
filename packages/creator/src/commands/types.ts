import type { CreatorRunReceipt } from "../receiptTypes.js";
export interface CreatorCommandDefinition {
  id: string;
  kind: "action" | "choice";
  scope: "project" | "runtime";
}
export interface CreatorCommandOption { id: string; label?: string; description?: string; disabled?: boolean; status?: "available" | "installed" | "disabled" | "conflict" }
export type CreatorCommandExecuteRequest =
  | { id: "theme"; args: { theme: string } }
  | { id: "install"; args: { resourceId: string } }
  | { id: "sync"; args: Record<string, never> };
export interface CreatorCommandCatalogEntry extends CreatorCommandDefinition {
  options: CreatorCommandOption[];
  current?: string;
}
export interface CreatorCommandCatalog { commands: CreatorCommandCatalogEntry[] }
export interface CreatorCommandResult { value?: string; changed: boolean; reenabled?: boolean; receipt: CreatorRunReceipt }
export interface CreatorCommandActivity {
  kind: "command";
  id: string;
  commandId: string;
  value?: string;
  status: "running" | "completed" | "failed";
  error?: string;
  reenabled?: boolean;
  receipt?: CreatorRunReceipt;
}
export const CREATOR_COMMANDS_API_PATH = "/__creator/commands";
