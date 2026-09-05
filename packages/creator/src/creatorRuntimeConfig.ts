import { readFileSync } from "node:fs";
import path from "node:path";

import {
  CREATOR_AGENT_RUNTIME_ENV,
  CREATOR_AGENT_RUNTIMES,
  CREATOR_PYTHON_AGENT_MODE_ENV,
  CREATOR_PYTHON_AGENT_MODES,
  type CreatorAgentRuntime,
  type CreatorPythonAgentMode,
} from "./shared.js";

export const CREATOR_HOST_ENV_FILE = ".env.creator.local";

export interface LoadCreatorAgentRuntimeOptions {
  configRoot?: string | undefined;
  environment?: NodeJS.ProcessEnv | undefined;
}

export function readCreatorHostConfigValue(
  configRoot: string | undefined,
  name: string,
): string | undefined {
  if (configRoot === undefined) {
    return undefined;
  }
  let source: string;
  try {
    source = readFileSync(path.join(configRoot, CREATOR_HOST_ENV_FILE), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  for (const rawLine of source.split(/\r?\n/u)) {
    const assignment = rawLine.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/u);
    if (assignment === null) {
      continue;
    }
    if (assignment[1] !== name) {
      continue;
    }
    const rawValue = assignment[2] ?? "";
    return (
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue
    ).trim();
  }
  return undefined;
}

export function resolveCreatorAgentRuntime(
  {
    configRoot,
    environment = process.env,
  }: LoadCreatorAgentRuntimeOptions = {},
): CreatorAgentRuntime {
  const runtime =
    environment[CREATOR_AGENT_RUNTIME_ENV]?.trim() ||
    readCreatorHostConfigValue(configRoot, CREATOR_AGENT_RUNTIME_ENV) ||
    "python";
  if (!(CREATOR_AGENT_RUNTIMES as readonly string[]).includes(runtime)) {
    throw new Error(
      `${CREATOR_AGENT_RUNTIME_ENV} must be one of: ${CREATOR_AGENT_RUNTIMES.join(", ")}.`,
    );
  }
  return runtime as CreatorAgentRuntime;
}

export function resolveCreatorPythonAgentMode(
  {
    configRoot,
    environment = process.env,
  }: LoadCreatorAgentRuntimeOptions = {},
): CreatorPythonAgentMode {
  const mode =
    environment[CREATOR_PYTHON_AGENT_MODE_ENV]?.trim() ||
    readCreatorHostConfigValue(configRoot, CREATOR_PYTHON_AGENT_MODE_ENV) ||
    "domain-write";
  if (!(CREATOR_PYTHON_AGENT_MODES as readonly string[]).includes(mode)) {
    throw new Error(
      `${CREATOR_PYTHON_AGENT_MODE_ENV} must be one of: ${CREATOR_PYTHON_AGENT_MODES.join(", ")}.`,
    );
  }
  return mode as CreatorPythonAgentMode;
}
