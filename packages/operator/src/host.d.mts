import type { AgentUIInitializationHost, AgentUIProjectConfig } from "@za38.03/agent-ui-operator/bootstrap";

/** Node host declarations, independent of the source implementation's bundler resolution. */
export interface CreatorProjectIssue { readonly code: string; readonly message: string; readonly severity?: "error" | "warning" }
export type CreatorProjectState =
  | { readonly status: "uninitialized" }
  | { readonly status: "ready"; readonly projectConfig: AgentUIProjectConfig; readonly paths: { readonly sourceRoot: string }; readonly warnings?: readonly CreatorProjectIssue[] }
  | { readonly status: "broken"; readonly issues: CreatorProjectIssue[] };
export function inspectCreatorProject(projectRoot: string): Promise<CreatorProjectState>;
export function createAgentUIInitializationHost(): AgentUIInitializationHost<unknown>;
export function installDemoPlugin(projectRoot: string, pluginId: string): Promise<void>;
export function handleUIOperatorRequest(request: unknown, projectRoot: string): Promise<
  | { ok: true; result: unknown }
  | { ok: false; error: { code: string; message: string } }
>;
