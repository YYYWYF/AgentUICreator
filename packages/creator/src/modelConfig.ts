import { readFileSync } from "node:fs";
import path from "node:path";

import { ChatOpenAI } from "@langchain/openai";

export const CREATOR_MODEL_ENV_FILE = ".env.creator.local";
export const CREATOR_MODEL_NAME = "mimo-v2.5-pro";

export interface CreatorModelConfig {
  provider: "openai";
  baseURL: string;
  apiKey: string;
  modelName: typeof CREATOR_MODEL_NAME;
}

export interface LoadCreatorModelConfigOptions {
  configRoot: string;
  environment?: NodeJS.ProcessEnv | undefined;
}

function parseEnvironmentFile(filePath: string): Record<string, string> {
  let source: string;

  try {
    source = readFileSync(filePath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `无法读取 ${path.basename(filePath)}：${message}`,
    );
  }

  const values: Record<string, string> = {};

  for (const [index, rawLine] of source.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }

    const assignment = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u);
    if (assignment === null) {
      throw new Error(
        `${path.basename(filePath)} 第 ${index + 1} 行的环境变量配置无效。`,
      );
    }

    const [, key = "", rawValue = ""] = assignment;
    const value = rawValue.trim();
    values[key] =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
        ? value.slice(1, -1)
        : value;
  }

  return values;
}

function requiredValue(
  name: string,
  environment: NodeJS.ProcessEnv,
  fileValues: Record<string, string>,
): string {
  const value = environment[name]?.trim() || fileValues[name]?.trim();
  if (value === undefined || value === "") {
    throw new Error(
      `Creator 模型需要在 ${CREATOR_MODEL_ENV_FILE} 中配置 ${name}。`,
    );
  }
  return value;
}

function assertCreatorModelName(
  modelName: string,
): asserts modelName is typeof CREATOR_MODEL_NAME {
  if (modelName !== CREATOR_MODEL_NAME) {
    throw new Error(
      `不支持 MODEL_NAME "${modelName}"。Creator 只允许使用 ${CREATOR_MODEL_NAME}。`,
    );
  }
}

export function loadCreatorModelConfig({
  configRoot,
  environment = process.env,
}: LoadCreatorModelConfigOptions): CreatorModelConfig {
  const fileValues = parseEnvironmentFile(
    path.join(configRoot, CREATOR_MODEL_ENV_FILE),
  );
  const provider = requiredValue("MODEL_PROVIDER", environment, fileValues);

  if (provider !== "openai") {
    throw new Error(
      `不支持 MODEL_PROVIDER "${provider}"。当前仅支持 OpenAI 兼容的聊天端点。`,
    );
  }

  const modelName = requiredValue("MODEL_NAME", environment, fileValues);
  assertCreatorModelName(modelName);

  return {
    provider,
    baseURL: requiredValue("MODEL_BASE_URL", environment, fileValues),
    apiKey: requiredValue("MODEL_API_KEY", environment, fileValues),
    modelName,
  };
}

export function createCreatorChatModel(config: CreatorModelConfig): ChatOpenAI {
  assertCreatorModelName(config.modelName);
  return new ChatOpenAI({
    apiKey: config.apiKey,
    configuration: { baseURL: config.baseURL },
    maxRetries: 1,
    model: config.modelName,
    modelKwargs: { parallel_tool_calls: false },
    timeout: 120_000,
    useResponsesApi: false,
  });
}
