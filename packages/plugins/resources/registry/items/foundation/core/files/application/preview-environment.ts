import { getPreviewAgentEnvironment as getEnvironment, usePreviewAgentEnvironment as useEnvironment } from "@za38.03/agent-ui-runtime/ui/application/preview-environment";
export type { PreviewAgentEnvironment } from "@za38.03/agent-ui-runtime/ui/application/preview-environment";
declare const process: { env: { NODE_ENV?: string } };
const development = process.env.NODE_ENV === "development";
/** Host development inputs are explicitly disabled in production. */
export function getPreviewAgentEnvironment() { return getEnvironment(development); }
export function usePreviewAgentEnvironment() { return useEnvironment(development); }
