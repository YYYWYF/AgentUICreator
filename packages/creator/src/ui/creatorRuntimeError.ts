import type { CreatorLocaleMessages } from "./i18n/locale.js";

export function creatorRuntimeErrorMessage(code: string, fallback: string, messages: CreatorLocaleMessages): string {
  const keys = {
    CREATOR_OPERATOR_RESTART_REQUIRED: "operatorRestartRequired",
    CREATOR_START_FAILED: "runtimeUnavailable",
    CREATOR_START_TIMEOUT: "runtimeUnavailable",
    CREATOR_HEALTH_INVALID: "runtimeUnavailable",
    CREATOR_RUN_NOT_FOUND: "runUnavailable",
    CREATOR_RUN_CURSOR_INVALID: "runUnavailable",
    CREATOR_RUN_CONNECTION_LOST: "runConnectionLost",
  } as const;
  const key = keys[code as keyof typeof keys];
  return key ? messages.creatorWorkbench[key] : fallback;
}
