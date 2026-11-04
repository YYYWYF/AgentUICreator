import type { ToolContext } from "./tools.js";
/** Project facts for navigation, without Plugin source, API schemas or execution plans. */
export declare function projectPluginDirectory(project: Record<string, any>): {
    status: string;
    coverage: string;
    sourceRoot: any;
    capabilityCatalogRevision: any;
    appUIModelHash: any;
    counts: {
        total: number;
        composed: number;
        enabled: number;
        disabled: number;
        notComposed: number;
        instances: number;
    };
    plugins: {
        pluginId: any;
        name: any;
        description: any;
        targetNames: string[];
        intents: any;
        role: any;
        componentPresentation?: any;
        state: string;
        sourceStatus: unknown;
        applicationPath: string | undefined;
        definitionPath?: string | undefined;
        defaultPlacement: any;
        requiredServices?: any;
        instances: {
            id: any;
            enabled: any;
            effectiveEnabled: any;
            target: any;
            index: any;
            layout?: object | undefined;
        }[];
    }[];
    applicationTargets: any;
    details: {
        plugin: string;
        composition: string;
        additionalCapabilities: string;
    };
    evidenceBoundary: string;
};
export declare function preparePluginDirectory(context: ToolContext): Promise<{
    status: string;
    coverage: string;
    sourceRoot: any;
    capabilityCatalogRevision: any;
    appUIModelHash: any;
    counts: {
        total: number;
        composed: number;
        enabled: number;
        disabled: number;
        notComposed: number;
        instances: number;
    };
    plugins: {
        pluginId: any;
        name: any;
        description: any;
        targetNames: string[];
        intents: any;
        role: any;
        componentPresentation?: any;
        state: string;
        sourceStatus: unknown;
        applicationPath: string | undefined;
        definitionPath?: string | undefined;
        defaultPlacement: any;
        requiredServices?: any;
        instances: {
            id: any;
            enabled: any;
            effectiveEnabled: any;
            target: any;
            index: any;
            layout?: object | undefined;
        }[];
    }[];
    applicationTargets: any;
    details: {
        plugin: string;
        composition: string;
        additionalCapabilities: string;
    };
    evidenceBoundary: string;
    runtimeObservation?: {
        tool: string;
        toolGroup: string;
        enableIfNeeded: {
            tool: string;
            input: {
                groups: string[];
            };
        };
        input: {
            nodeRefs: any[];
        } | {
            nodeRefs?: never;
        };
        useWhen: string;
        coverage: string;
        evidenceBoundary: string;
    };
    reason?: never;
    nextTool?: never;
} | {
    status: string;
    reason: any;
    nextTool: string;
    coverage: string;
}>;
//# sourceMappingURL=plugin-directory.d.ts.map