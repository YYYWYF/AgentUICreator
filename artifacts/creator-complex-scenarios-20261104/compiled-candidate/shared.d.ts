export declare const CREATOR_API_PATH = "/__creator/run";
export declare const CREATOR_CONTROL_API_PATH = "/__creator/control";
export declare const CREATOR_RUNTIME_DIAGNOSTICS_API_PATH = "/__creator/runtime-diagnostics";
export declare const CREATOR_VISUAL_OBSERVATION_API_PATH = "/__creator/visual-observation";
export declare const CREATOR_AGENT_MODE_ENV = "CREATOR_AGENT_MODE";
export declare const CREATOR_ENDPOINT_ENV = "CREATOR_ENDPOINT";
export declare const CREATOR_AUTH_TOKEN_ENV = "CREATOR_AUTH_TOKEN";
export declare const CREATOR_HOT_RELOAD_ENV = "CREATOR_HOT_RELOAD";
export declare const CREATOR_VERIFICATION_MODE_ENV = "CREATOR_VERIFICATION_MODE";
export declare const CREATOR_VERIFICATION_MODES: readonly ["static_only", "static_and_runtime"];
export declare const CREATOR_AGENT_MODES: readonly ["echo", "minimal", "domain-read", "domain-write"];
export type CreatorAgentMode = (typeof CREATOR_AGENT_MODES)[number];
export type CreatorVerificationMode = (typeof CREATOR_VERIFICATION_MODES)[number];
//# sourceMappingURL=shared.d.ts.map