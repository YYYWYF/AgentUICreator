import { access, mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  AGENT_UI_PROJECT_CONFIG_VERSION,
  type AgentUIProjectConfig,
} from "../../framework/contracts/agent-ui-project";
import type { AgentUIMode } from "../../framework/contracts/agent-ui-mode";
import type { AppUIModel } from "../../framework/contracts/app-ui-model";
import { agentUIModeRegistry } from "../../framework/modes";
import { AGENT_UI_PROJECT_CONFIG_FILE } from "./project-mode";

export interface CreateUIProjectOptions {
  readonly projectRoot: string;
  readonly mode?: AgentUIMode;
  readonly metadataRoot?: string;
}

export interface CreateUIProjectResult {
  readonly mode: AgentUIMode;
  readonly projectConfig: AgentUIProjectConfig;
  readonly appUIModel: AppUIModel;
  readonly projectConfigPath: string;
  readonly appUIModelPath: string;
}

async function assertPathDoesNotExist(filePath: string): Promise<void> {
  try {
    await access(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }
  throw new Error(`Refusing to overwrite existing project file: ${filePath}`);
}

/** Initializes Mode and composition files after the target project scaffold exists. */
export async function createUIProject({
  projectRoot,
  mode = "platform",
  metadataRoot = ".agent-ui",
}: CreateUIProjectOptions): Promise<CreateUIProjectResult> {
  const definition = agentUIModeRegistry.get(mode);
  const appUIModel = definition.createInitialAppUIModel();
  const projectConfig: AgentUIProjectConfig = {
    version: AGENT_UI_PROJECT_CONFIG_VERSION,
    mode,
  };
  const projectConfigPath = path.posix.join(
    metadataRoot,
    AGENT_UI_PROJECT_CONFIG_FILE,
  );
  const appUIModelPath = "app-ui/app-ui.json";
  const absoluteProjectConfigPath = path.join(projectRoot, projectConfigPath);
  const absoluteAppUIModelPath = path.join(projectRoot, appUIModelPath);

  await assertPathDoesNotExist(absoluteProjectConfigPath);
  await assertPathDoesNotExist(absoluteAppUIModelPath);

  await mkdir(path.join(projectRoot, metadataRoot), { recursive: true });
  await mkdir(path.join(projectRoot, "app-ui"), { recursive: true });
  const writes = await Promise.allSettled([
    writeFile(
      absoluteProjectConfigPath,
      `${JSON.stringify(projectConfig, null, 2)}\n`,
      { flag: "wx" },
    ),
    writeFile(
      absoluteAppUIModelPath,
      `${JSON.stringify(appUIModel, null, 2)}\n`,
      { flag: "wx" },
    ),
  ]);
  const failedWrite = writes.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failedWrite !== undefined) {
    await Promise.all(
      writes.flatMap((result, index) =>
        result.status === "fulfilled"
          ? [unlink(index === 0 ? absoluteProjectConfigPath : absoluteAppUIModelPath)]
          : [],
      ),
    );
    throw new Error(
      "Could not initialize Agent UI project files without overwriting existing state.",
      { cause: failedWrite.reason },
    );
  }

  return {
    mode,
    projectConfig,
    appUIModel,
    projectConfigPath,
    appUIModelPath,
  };
}
