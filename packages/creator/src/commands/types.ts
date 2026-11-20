import type { CreatorRunReceipt } from "../receiptTypes.js";
export type { AgentUIPluginPlacementGuide } from "@za38.03/agent-ui-creator/project/commands";
import type { AgentUIPluginPlacementGuide } from "@za38.03/agent-ui-creator/project/commands";
import type { PluginSourceTakeoverPlan } from "@za38.03/agent-ui-creator/project/commands";
export interface CreatorCommandDefinition {
  id: string;
  kind: "action" | "choice";
  scope: "project" | "runtime";
}
export interface CreatorCommandOption { action?: "add"; category?: string; pluginId?: string; id: string; label?: string; description?: string; disabled?: boolean; status?: "available" | "installed" | "disabled" | "conflict" }
export type CreatorCommandExecuteRequest =
  | { id: "enable"; args: { pluginId: string; preparationId?: string } | { instanceId: string; preparationId?: string } }
  | { id: "disable"; args: { instanceId: string } }
  | { id: "takeover"; args: { pluginId: string; preparationId?: string } }
  | { id: "sync"; args: Record<string, never> };
export interface CreatorCommandCatalogEntry extends CreatorCommandDefinition {
  options: CreatorCommandOption[];
  current?: string;
}
export interface CreatorCommandCatalog { commands: CreatorCommandCatalogEntry[] }
export interface CreatorCommandResult { status?: "integration-required" | "confirmation-required" | "placement-required"; takeover?: { id: string; plan: PluginSourceTakeoverPlan }; preparation?: { id: string; pluginId: string; files: string[]; packages: { name: string; required: string; installed?: string; declared?: string }[] }; integrationPlan?: Awaited<ReturnType<typeof import("@za38.03/agent-ui-creator/project/resources").planIntegrationRecipe>>; value?: string; changed: boolean; reenabled?: boolean; receipt: CreatorRunReceipt; placementGuide?: AgentUIPluginPlacementGuide }
export interface CreatorCommandActivity {
  kind: "command";
  id: string;
  commandId: string;
  value?: string;
  status: "running" | "completed" | "failed" | "integration-required" | "agent-required" | "placement-required" | "cancelled";
  error?: string;
  reenabled?: boolean;
  receipt?: CreatorRunReceipt;
  placementGuide?: AgentUIPluginPlacementGuide;
}
export const CREATOR_COMMANDS_API_PATH = "/__creator/commands";
