export const CREATOR_API_PATH = "/__creator/run";
export const CREATOR_RUNTIME_DIAGNOSTICS_API_PATH =
  "/__creator/runtime-diagnostics";
export const CREATOR_AGENT_RUNTIME_ENV = "CREATOR_AGENT_RUNTIME";
export const CREATOR_AGENT_RUNTIMES = ["typescript", "python"] as const;

export type CreatorAgentRuntime = (typeof CREATOR_AGENT_RUNTIMES)[number];
