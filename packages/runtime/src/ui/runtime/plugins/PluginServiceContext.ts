import { useOptionalPluginServiceRuntime as useOptionalPort, usePluginServiceRuntime as usePort } from "@za38.03/agent-ui-plugins";
import type { PluginServiceRuntime } from "./PluginServiceRuntime.js";
export { PluginServiceRuntimeContext, PluginServiceConsumerContext, PluginServiceRuntimeProvider, PluginServiceConsumerProvider, usePluginService, usePluginServiceRuntimeRevision } from "@za38.03/agent-ui-plugins";
export type { PluginServiceConsumerScope } from "@za38.03/agent-ui-plugins";
// Project internals retain the concrete activation store; public hooks use its read-only port.
export function useOptionalPluginServiceRuntime(): PluginServiceRuntime | null { return useOptionalPort() as PluginServiceRuntime | null; }
export function usePluginServiceRuntime(): PluginServiceRuntime { return usePort() as PluginServiceRuntime; }
