import { useOptionalPluginServiceRuntime as useOptionalPort, usePluginServiceRuntime as usePort } from "../../../plugin-api/index.js";
import type { PluginServiceRuntime } from "./PluginServiceRuntime.js";
export { PluginServiceRuntimeContext, PluginServiceConsumerContext, PluginServiceRuntimeProvider, PluginServiceConsumerProvider, usePluginService, usePluginServiceRuntimeRevision } from "../../../plugin-api/index.js";
export type { PluginServiceConsumerScope } from "../../../plugin-api/index.js";
// Project internals retain the concrete activation store; public hooks use its read-only port.
export function useOptionalPluginServiceRuntime(): PluginServiceRuntime | null { return useOptionalPort() as PluginServiceRuntime | null; }
export function usePluginServiceRuntime(): PluginServiceRuntime { return usePort() as PluginServiceRuntime; }
