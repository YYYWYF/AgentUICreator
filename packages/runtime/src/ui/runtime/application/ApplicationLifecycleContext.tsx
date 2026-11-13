import { useApplicationLifecycleRuntime as usePort, useOptionalApplicationLifecycleRuntime as useOptionalPort } from "../../../plugin-api/index.js";
import type { ApplicationLifecycleRuntime } from "./ApplicationLifecycleRuntime.js";
export { ApplicationLifecycleContext, ApplicationLifecycleProvider, useApplicationLifecycle } from "../../../plugin-api/index.js";
export function useApplicationLifecycleRuntime(): ApplicationLifecycleRuntime { return usePort() as ApplicationLifecycleRuntime; }
export function useOptionalApplicationLifecycleRuntime(): ApplicationLifecycleRuntime | null { return useOptionalPort() as ApplicationLifecycleRuntime | null; }
