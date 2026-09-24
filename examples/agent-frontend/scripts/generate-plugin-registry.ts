import { randomUUID } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseAppUIModelJson } from "../framework/contracts/app-ui-model";
import { readAgentUIProjectConfig } from "./ui-project/project-mode";
import type { AgentUIProjectConfig } from "../framework/contracts/agent-ui-project";
import { resolveAgentUIProjectPaths, projectControlConfigForPaths, projectRelativePath } from "./ui-project/agent-ui-project-paths";
import {
  generatePluginRegistry,
} from "./ui-project/registry-generator";

const defaultProjectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function readOptional(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

export async function writeGeneratedPluginRegistry(
  projectRoot: string,
  options: { projectConfigOverride?: AgentUIProjectConfig } = {},
): Promise<{
  changed: boolean;
  path: string;
  pluginIds: string[];
}> {
  const projectConfig = options.projectConfigOverride ?? (await readAgentUIProjectConfig(projectRoot)).config;
  const paths = resolveAgentUIProjectPaths(projectRoot, projectConfig);
  const model = parseAppUIModelJson(
    await readFile(paths.appUIModelPath, "utf8"),
  );
  const generation = await generatePluginRegistry(projectRoot, model, {
    config: projectControlConfigForPaths(paths), paths,
  });
  if (generation.errors.length > 0) {
    throw new Error(JSON.stringify({ errors: generation.errors }, null, 2));
  }

  const registryPath = paths.generatedPluginRegistryPath;
  const relativePath = projectRelativePath(projectRoot, registryPath);
  const currentSource = await readOptional(registryPath);
  if (options.projectConfigOverride !== undefined && currentSource !== undefined) {
    throw new Error(`Refusing to overwrite existing generated Plugin Registry: ${relativePath}`);
  }
  if (currentSource === generation.capabilityCatalog.source) {
    return {
      changed: false,
      path: relativePath,
      pluginIds: generation.capabilityCatalog.pluginIds,
    };
  }

  if (options.projectConfigOverride !== undefined) {
    await writeFile(registryPath, generation.capabilityCatalog.source, { flag: "wx" });
    return {
      changed: true,
      path: relativePath,
      pluginIds: generation.capabilityCatalog.pluginIds,
    };
  }

  const temporaryPath = `${registryPath}.${randomUUID()}.tmp`;
  try {
    await writeFile(
      temporaryPath,
      generation.capabilityCatalog.source,
      "utf8",
    );
    await rename(temporaryPath, registryPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }

  return {
    changed: true,
    path: relativePath,
    pluginIds: generation.capabilityCatalog.pluginIds,
  };
}

async function main(): Promise<void> {
  console.log(
    JSON.stringify(await writeGeneratedPluginRegistry(defaultProjectRoot), null, 2),
  );
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
