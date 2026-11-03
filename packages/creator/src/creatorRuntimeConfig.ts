import { parseEnv } from "node:util";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  CREATOR_AGENT_MODE_ENV,
  CREATOR_AGENT_MODES,
  CREATOR_VERIFICATION_MODE_ENV,
  CREATOR_VERIFICATION_MODES,
  type CreatorAgentMode,
  type CreatorVerificationMode,
} from "./shared.js";

export const CREATOR_HOST_ENV_FILE = ".agent-ui/creator/.env.local";

export interface LoadCreatorHostConfigOptions {
  configRoot?: string | undefined;
  environment?: NodeJS.ProcessEnv | undefined;
}

export function readCreatorHostEnvironment(configRoot?: string): Record<string, string | undefined> {
  if (configRoot === undefined) return {};
  try {
    return parseEnv(readFileSync(path.join(configRoot, CREATOR_HOST_ENV_FILE), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

export function readCreatorHostConfigValue(
  configRoot: string | undefined,
  name: string,
): string | undefined {
  return readCreatorHostEnvironment(configRoot)[name]?.trim();
}

export function resolveCreatorAgentMode(
  {
    configRoot,
    environment = process.env,
  }: LoadCreatorHostConfigOptions = {},
): CreatorAgentMode {
  const mode =
    environment.CREATOR_AGENT_MODE?.trim() ||
    readCreatorHostConfigValue(configRoot, "CREATOR_AGENT_MODE") ||
    "domain-write";
  if (!(CREATOR_AGENT_MODES as readonly string[]).includes(mode)) {
    throw new Error(
      `${CREATOR_AGENT_MODE_ENV} must be one of: ${CREATOR_AGENT_MODES.join(", ")}.`,
    );
  }
  return mode as CreatorAgentMode;
}

export function resolveCreatorVerificationMode(
  {
    configRoot,
    environment = process.env,
  }: LoadCreatorHostConfigOptions = {},
): CreatorVerificationMode {
  const mode =
    environment[CREATOR_VERIFICATION_MODE_ENV]?.trim() ||
    readCreatorHostConfigValue(configRoot, CREATOR_VERIFICATION_MODE_ENV) ||
    "static_only";
  if (!(CREATOR_VERIFICATION_MODES as readonly string[]).includes(mode)) {
    throw new Error(
      `${CREATOR_VERIFICATION_MODE_ENV} must be one of: ${CREATOR_VERIFICATION_MODES.join(", ")}.`,
    );
  }
  return mode as CreatorVerificationMode;
}
