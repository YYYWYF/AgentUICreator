import { useApplicationLifecycleRuntime as usePort, useOptionalApplicationLifecycleRuntime as useOptionalPort } from "@za38.03/agent-ui-plugins";
import type { ApplicationLifecycleRuntime } from "./ApplicationLifecycleRuntime.js";
export { ApplicationLifecycleContext, ApplicationLifecycleProvider, useApplicationLifecycle } from "@za38.03/agent-ui-plugins";
export function useApplicationLifecycleRuntime(): ApplicationLifecycleRuntime { return usePort() as ApplicationLifecycleRuntime; }
export function useOptionalApplicationLifecycleRuntime(): ApplicationLifecycleRuntime | null { return useOptionalPort() as ApplicationLifecycleRuntime | null; }
