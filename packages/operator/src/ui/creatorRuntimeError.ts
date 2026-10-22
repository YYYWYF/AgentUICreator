import type { CreatorLocaleMessages } from "./i18n/locale.js";

export function creatorRuntimeErrorMessage(code: string, fallback: string, messages: CreatorLocaleMessages): string {
  const keys = {
    CREATOR_OPERATOR_RESTART_REQUIRED: "operatorRestartRequired",
    CREATOR_SIDECAR_PACKAGE_MISSING: "sidecarPackageMissing",
    CREATOR_SIDECAR_PACKAGE_INVALID: "sidecarPackageInvalid",
    CREATOR_SIDECAR_PLATFORM_UNSUPPORTED: "sidecarPlatformUnsupported",
    CREATOR_PYTHON_RUNTIME_MISSING: "pythonRuntimeUnavailable",
    CREATOR_PYTHON_ENVIRONMENT_INVALID: "pythonRuntimeUnavailable",
  } as const;
  const key = keys[code as keyof typeof keys];
  return key ? messages.creatorWorkbench[key] : fallback;
}
