import { readFile } from "node:fs/promises";
import path from "node:path";
import { AGENT_UI_MODES, type AgentUIMode } from "../framework/contracts/agent-ui-mode";

import {
  parseAgentUIProjectConfigJson,
  type AgentUIProjectConfig,
} from "../framework/contracts/agent-ui-project";

export const AGENT_UI_PROJECT_CONFIG_FILE = "project.json";

export type ResolvedAgentUIProjectConfig = AgentUIProjectConfig & { readonly mode: AgentUIMode };

export interface ReadAgentUIProjectConfigResult {
  readonly config: ResolvedAgentUIProjectConfig;
  readonly path: string;
}

export async function readAgentUIProjectConfig(
  projectRoot: string,
  metadataRoot = ".agent-ui",
): Promise<ReadAgentUIProjectConfigResult> {
  const relativePath = path.posix.join(metadataRoot, AGENT_UI_PROJECT_CONFIG_FILE);
  const absolutePath = path.join(projectRoot, relativePath);

  try {
    const source = await readFile(absolutePath, "utf8");
    return {
      config: await resolveProjectTemplate(projectRoot, parseAgentUIProjectConfigJson(source), metadataRoot),
      path: relativePath,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
    throw new Error("Invalid Agent UI project configuration.");
  }
}

/** Tool-only template provenance, never persisted or consumed by frontend Runtime.
 * The source lock already records which fixed shell was initialized. Existing
 * project metadata is read without rewriting it or replacing customized shells.
 */
export async function resolveProjectTemplate(
  projectRoot: string,
  config: AgentUIProjectConfig,
  metadataRoot = ".agent-ui",
): Promise<ResolvedAgentUIProjectConfig> {
  if (config.mode !== undefined) return { ...config, mode: config.mode };
  const lock = JSON.parse(await readFile(path.join(projectRoot, metadataRoot, "source-lock.json"), "utf8"));
  if (lock.sourceRoot !== config.sourceRoot || typeof lock.items !== "object" || lock.items === null || Array.isArray(lock.items)) {
    throw new Error("Invalid fixed Agent UI template provenance.");
  }
  const selected = AGENT_UI_MODES.filter(template => Object.hasOwn(lock.items, `foundation/shell-${template}`));
  if (selected.length !== 1) throw new Error("Expected exactly one initialized Agent UI shell template.");
  return { ...config, mode: selected[0]! };
}
