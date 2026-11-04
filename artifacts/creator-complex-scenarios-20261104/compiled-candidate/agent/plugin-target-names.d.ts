export declare function pluginTargetNames(plugin: {
    pluginId: string;
    name?: string;
    targetNames?: readonly string[];
}): string[];
/** Do not let one shared word such as history override a different feature.
 * Unrecognized natural descriptions remain available for user clarification. */
export declare function namesRequestedPlugins(request: string, plugins: readonly {
    pluginId: string;
    name?: string;
    targetNames?: readonly string[];
}[], history?: readonly {
    user: string;
    assistant?: string;
}[]): boolean;
/** Naming a Plugin for an addition is not authority to remove that Plugin. */
export declare function namesRequestedRemoval(request: string, plugins: Parameters<typeof namesRequestedPlugins>[1], history?: Parameters<typeof namesRequestedPlugins>[2]): boolean;
//# sourceMappingURL=plugin-target-names.d.ts.map