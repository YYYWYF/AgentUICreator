import { randomUUID } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseAppUIModelJson } from "../framework/contracts/app-ui-model";
import {
  GENERATED_PLUGIN_REGISTRY_PATH,
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
): Promise<{
  changed: boolean;
  path: string;
  pluginIds: string[];
}> {
  const model = parseAppUIModelJson(
    await readFile(path.join(projectRoot, "app-ui", "app-ui.json"), "utf8"),
  );
  const generation = await generatePluginRegistry(projectRoot, model);
  if (generation.errors.length > 0) {
    throw new Error(JSON.stringify({ errors: generation.errors }, null, 2));
  }

  const registryPath = path.join(projectRoot, GENERATED_PLUGIN_REGISTRY_PATH);
  const currentSource = await readOptional(registryPath);
  if (currentSource === generation.source) {
    return {
      changed: false,
      path: GENERATED_PLUGIN_REGISTRY_PATH,
      pluginIds: generation.registeredPluginIds,
    };
  }

  const temporaryPath = `${registryPath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, generation.source, "utf8");
    await rename(temporaryPath, registryPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }

  return {
    changed: true,
    path: GENERATED_PLUGIN_REGISTRY_PATH,
    pluginIds: generation.registeredPluginIds,
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
