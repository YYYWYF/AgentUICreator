import type { ToolContext } from "./tools.js";
/** Composition must use the installed Plugin's project application and Host
 * bindings. Preparing that thin layer is separate from implementation takeover. */
export declare function prepareCompositionApplications(context: ToolContext, input: {
    operations?: any[];
}): Promise<undefined>;
//# sourceMappingURL=plugin-applications.d.ts.map