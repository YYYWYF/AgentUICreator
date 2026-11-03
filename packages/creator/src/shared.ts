export const CREATOR_API_PATH = "/__creator/run";
export const CREATOR_CONTROL_API_PATH = "/__creator/control";
export const CREATOR_RUNTIME_DIAGNOSTICS_API_PATH =
  "/__creator/runtime-diagnostics";
export const CREATOR_VISUAL_OBSERVATION_API_PATH =
  "/__creator/visual-observation";
export const CREATOR_AGENT_MODE_ENV = "CREATOR_AGENT_MODE";
export const CREATOR_ENDPOINT_ENV = "CREATOR_ENDPOINT";
export const CREATOR_AUTH_TOKEN_ENV = "CREATOR_AUTH_TOKEN";
export const CREATOR_HOT_RELOAD_ENV = "CREATOR_HOT_RELOAD";
export const CREATOR_VERIFICATION_MODE_ENV = "CREATOR_VERIFICATION_MODE";
export const CREATOR_VERIFICATION_MODES = [
  "static_only",
  "static_and_runtime",
] as const;
export const CREATOR_AGENT_MODES = [
  "echo",
  "minimal",
  "domain-read",
  "domain-write",
] as const;

export type CreatorAgentMode =
  (typeof CREATOR_AGENT_MODES)[number];
export type CreatorVerificationMode =
  (typeof CREATOR_VERIFICATION_MODES)[number];
