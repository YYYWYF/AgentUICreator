export const CREATOR_API_PATH = "/__creator/run";
export const CREATOR_RUNTIME_DIAGNOSTICS_API_PATH =
  "/__creator/runtime-diagnostics";
export const CREATOR_AGENT_RUNTIME_ENV = "CREATOR_AGENT_RUNTIME";
export const CREATOR_AGENT_RUNTIMES = ["typescript", "python"] as const;
export const CREATOR_PYTHON_AGENT_MODE_ENV = "CREATOR_PYTHON_AGENT_MODE";
export const CREATOR_PYTHON_ENDPOINT_ENV = "CREATOR_PYTHON_ENDPOINT";
export const CREATOR_PYTHON_AUTH_TOKEN_ENV = "CREATOR_PYTHON_AUTH_TOKEN";
export const CREATOR_PYTHON_AGENT_MODES = [
  "echo",
  "minimal",
  "domain-read",
  "domain-write",
] as const;

export type CreatorAgentRuntime = (typeof CREATOR_AGENT_RUNTIMES)[number];
export type CreatorPythonAgentMode =
  (typeof CREATOR_PYTHON_AGENT_MODES)[number];
