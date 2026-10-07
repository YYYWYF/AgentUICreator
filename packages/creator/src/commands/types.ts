import type { CreatorRunReceipt } from "../receiptTypes.js";
export interface CreatorCommandDefinition {
  id: string;
  kind: "action" | "choice";
  scope: "project" | "runtime";
}
export interface CreatorCommandCatalogEntry extends CreatorCommandDefinition {
  options: { id: string }[];
  current?: string;
}
export interface CreatorCommandCatalog { commands: CreatorCommandCatalogEntry[] }
export interface CreatorCommandResult { current: string; receipt: CreatorRunReceipt }
export interface CreatorCommandActivity {
  kind: "command";
  id: string;
  commandId: string;
  value?: string;
  status: "running" | "completed" | "failed";
  error?: string;
  receipt?: CreatorRunReceipt;
}
export const CREATOR_COMMANDS_API_PATH = "/__creator/commands";
