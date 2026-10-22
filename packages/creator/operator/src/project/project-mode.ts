import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  parseAgentUIProjectConfigJson,
  type AgentUIProjectConfig,
} from "../framework/contracts/agent-ui-project";

export const AGENT_UI_PROJECT_CONFIG_FILE = "project.json";

export interface ReadAgentUIProjectConfigResult {
  readonly config: AgentUIProjectConfig;
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
      config: parseAgentUIProjectConfigJson(source),
      path: relativePath,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
    throw new Error("Invalid Agent UI project configuration.");
  }
}
