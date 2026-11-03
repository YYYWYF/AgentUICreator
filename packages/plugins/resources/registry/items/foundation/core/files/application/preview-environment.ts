import { getPreviewAgentEnvironment as getEnvironment, usePreviewAgentEnvironment as useEnvironment } from "@za38.03/agent-ui-runtime/ui/application/preview-environment";
export type { PreviewAgentEnvironment } from "@za38.03/agent-ui-runtime/ui/application/preview-environment";
/** Host development inputs are explicitly disabled in production. */
export function getPreviewAgentEnvironment() { return getEnvironment(import.meta.env.DEV); }
export function usePreviewAgentEnvironment() { return useEnvironment(import.meta.env.DEV); }
