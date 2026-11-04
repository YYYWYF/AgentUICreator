import { parseEnv } from "node:util";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CREATOR_AGENT_MODE_ENV, CREATOR_AGENT_MODES, CREATOR_VERIFICATION_MODE_ENV, CREATOR_VERIFICATION_MODES, } from "./shared.js";
export const CREATOR_HOST_ENV_FILE = ".agent-ui/creator/.env.local";
export function readCreatorHostEnvironment(configRoot) {
    if (configRoot === undefined)
        return {};
    try {
        return parseEnv(readFileSync(path.join(configRoot, CREATOR_HOST_ENV_FILE), "utf8"));
    }
    catch (error) {
        if (error.code === "ENOENT")
            return {};
        throw error;
    }
}
export function readCreatorHostConfigValue(configRoot, name) {
    return readCreatorHostEnvironment(configRoot)[name]?.trim();
}
export function resolveCreatorAgentMode({ configRoot, environment = process.env, } = {}) {
    const mode = environment.CREATOR_AGENT_MODE?.trim() ||
        readCreatorHostConfigValue(configRoot, "CREATOR_AGENT_MODE") ||
        "domain-write";
    if (!CREATOR_AGENT_MODES.includes(mode)) {
        throw new Error(`${CREATOR_AGENT_MODE_ENV} must be one of: ${CREATOR_AGENT_MODES.join(", ")}.`);
    }
    return mode;
}
export function resolveCreatorVerificationMode({ configRoot, environment = process.env, } = {}) {
    const mode = environment[CREATOR_VERIFICATION_MODE_ENV]?.trim() ||
        readCreatorHostConfigValue(configRoot, CREATOR_VERIFICATION_MODE_ENV) ||
        "static_only";
    if (!CREATOR_VERIFICATION_MODES.includes(mode)) {
        throw new Error(`${CREATOR_VERIFICATION_MODE_ENV} must be one of: ${CREATOR_VERIFICATION_MODES.join(", ")}.`);
    }
    return mode;
}
//# sourceMappingURL=creatorRuntimeConfig.js.map