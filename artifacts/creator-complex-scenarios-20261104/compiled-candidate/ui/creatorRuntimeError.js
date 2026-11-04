export function creatorRuntimeErrorMessage(code, fallback, messages) {
    const keys = {
        CREATOR_OPERATOR_RESTART_REQUIRED: "operatorRestartRequired",
        CREATOR_START_FAILED: "runtimeUnavailable",
        CREATOR_START_TIMEOUT: "runtimeUnavailable",
        CREATOR_HEALTH_INVALID: "runtimeUnavailable",
        CREATOR_RUN_NOT_FOUND: "runUnavailable",
        CREATOR_RUN_CURSOR_INVALID: "runUnavailable",
        CREATOR_RUN_CONNECTION_LOST: "runConnectionLost",
    };
    const key = keys[code];
    return key ? messages.creatorWorkbench[key] : fallback;
}
//# sourceMappingURL=creatorRuntimeError.js.map