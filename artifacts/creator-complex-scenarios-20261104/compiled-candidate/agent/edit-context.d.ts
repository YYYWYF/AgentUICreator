import { z } from "zod";
import { type EditingTarget } from "./editing-session.js";
import type { ToolContext } from "./tools.js";
/** A unique explicitly named existing owner is navigation, never a mutation route. */
export declare function requestedEditingPlugin(context: Pick<ToolContext, "readOnly" | "userMessage">, directory: {
    plugins?: readonly {
        pluginId: string;
        name: string;
        targetNames: readonly string[];
        applicationPath: string | undefined;
    }[];
}): string | undefined;
export declare const editContextInput: z.ZodObject<{
    query: z.ZodOptional<z.ZodString>;
    targetId: z.ZodOptional<z.ZodString>;
    pluginId: z.ZodOptional<z.ZodString>;
    focus: z.ZodOptional<z.ZodString>;
    sharedSymbols: z.ZodOptional<z.ZodArray<z.ZodString>>;
    sharedModule: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
interface Candidate {
    id: string;
    kind: EditingTarget["kind"] | "official_plugin_reference";
    name: string;
    description: string;
    intents?: string[];
    relatedPluginIds?: string[];
}
/** Retrieval ranks existing owners; it never maps request words to mutations. */
export declare function findEditingTargets(candidates: Candidate[], query: string): {
    id: string;
    kind: EditingTarget["kind"] | "official_plugin_reference";
    name: string;
    description: string;
    intents?: string[];
    relatedPluginIds?: string[];
    score: number;
}[];
/** Preserve inspected ownership, separately from grants and source freshness. */
export declare function rememberPluginOwnership(context: ToolContext, inspection: Record<string, any>): Promise<{
    pluginId: any;
    entryPath?: string;
    assetOwnership: any;
    implementationOwnership: "npm" | "project" | "unknown";
    projectEntryEdits: string;
    implementationTakeoverRequired: boolean | null;
} | undefined>;
export declare function rememberInspectedPlugin(context: ToolContext, inspection: Record<string, any>, options?: {
    referenceOnly?: boolean;
}): Promise<void>;
export declare function inspectEditingContext(context: ToolContext, input: z.infer<typeof editContextInput>): Promise<{
    status: string;
    catalogRevision: any;
    candidates: Candidate[];
    totalMatches: number;
    candidatesTruncated: boolean;
    interpretation: string;
} | {
    catalogRevision?: never;
    candidates?: never;
    totalMatches?: never;
    candidatesTruncated?: never;
    status: string;
    pluginId: string | undefined;
    plugin?: {
        pluginId: any;
        ownership: any;
        instances: any;
        manifest: any;
        definitionSource: any;
        services: any;
        implementationOwnership?: never;
        application?: never;
        compositionParents?: never;
    };
    references?: {
        publicApi: {
            status: string;
            interpretation: string;
        };
        sharedTypes: any;
        usageGuide?: never;
        documentation: {
            status: string;
            referenceOnly: boolean;
            creatorVersion?: never;
            entries?: never;
            interpretation?: never;
        } | {
            status: string;
            referenceOnly: boolean;
            creatorVersion: any;
            entries: {
                documentId: string;
                title: string;
                source: "internal" | "public";
                nextRead: {
                    tool: string;
                    input: {
                        action: string;
                        documentId: string;
                        sectionId?: string;
                    };
                };
                matchingSections: never[];
            }[];
            interpretation?: never;
        } | {
            status: string;
            referenceOnly: boolean;
            creatorVersion: any;
            entries: {
                documentId: string;
                title: string;
                source: "internal" | "public";
                nextRead: {
                    tool: string;
                    input: {
                        action: string;
                        documentId: string;
                        sectionId?: string;
                    };
                };
                matchingSections: {
                    sectionId: string;
                    title: string;
                    nextRead: {
                        tool: string;
                        input: {
                            action: string;
                            documentId: string;
                            sectionId?: string;
                        };
                    };
                }[];
            }[];
            interpretation: string;
        };
    } | {
        usageGuide: any;
        publicApi: any;
        sharedTypes: any;
        documentation: {
            status: string;
            referenceOnly: boolean;
            creatorVersion?: never;
            entries?: never;
            interpretation?: never;
        } | {
            status: string;
            referenceOnly: boolean;
            creatorVersion: any;
            entries: {
                documentId: string;
                title: string;
                source: "internal" | "public";
                nextRead: {
                    tool: string;
                    input: {
                        action: string;
                        documentId: string;
                        sectionId?: string;
                    };
                };
                matchingSections: never[];
            }[];
            interpretation?: never;
        } | {
            status: string;
            referenceOnly: boolean;
            creatorVersion: any;
            entries: {
                documentId: string;
                title: string;
                source: "internal" | "public";
                nextRead: {
                    tool: string;
                    input: {
                        action: string;
                        documentId: string;
                        sectionId?: string;
                    };
                };
                matchingSections: {
                    sectionId: string;
                    title: string;
                    nextRead: {
                        tool: string;
                        input: {
                            action: string;
                            documentId: string;
                            sectionId?: string;
                        };
                    };
                }[];
            }[];
            interpretation: string;
        };
    };
    interpretation: string;
} | {
    catalogRevision?: never;
    candidates?: never;
    totalMatches?: never;
    candidatesTruncated?: never;
    status: string;
    target: EditingTarget;
    files: {
        path: string;
        content: string;
        hash: string;
        totalLines: number;
        rangeStatus?: string;
        firstOffset?: number;
        lastOffset?: number;
        nextOffset: number | null;
    }[];
    unavailableFiles: {
        path: string;
        code: string;
    }[];
    editingPolicy?: {
        pluginId: any;
        entryPath?: string;
        assetOwnership: any;
        implementationOwnership: "npm" | "project" | "unknown";
        projectEntryEdits: string;
        implementationTakeoverRequired: boolean | null;
    };
    plugin: {
        ownership?: never;
        pluginId: string | undefined;
        instances: any;
        manifest: any;
        definitionSource: any;
        implementationOwnership: any;
        application: {
            entryPath: any;
            implementationImport: any;
            implementationBoundary: any;
            editable: any;
        } | undefined;
        services: any;
        compositionParents: any;
    };
    references: {
        publicApi: {
            status: string;
            interpretation: string;
        };
        sharedTypes: any;
        usageGuide?: never;
        documentation: {
            status: string;
            referenceOnly: boolean;
            creatorVersion?: never;
            entries?: never;
            interpretation?: never;
        } | {
            status: string;
            referenceOnly: boolean;
            creatorVersion: any;
            entries: {
                documentId: string;
                title: string;
                source: "internal" | "public";
                nextRead: {
                    tool: string;
                    input: {
                        action: string;
                        documentId: string;
                        sectionId?: string;
                    };
                };
                matchingSections: never[];
            }[];
            interpretation?: never;
        } | {
            status: string;
            referenceOnly: boolean;
            creatorVersion: any;
            entries: {
                documentId: string;
                title: string;
                source: "internal" | "public";
                nextRead: {
                    tool: string;
                    input: {
                        action: string;
                        documentId: string;
                        sectionId?: string;
                    };
                };
                matchingSections: {
                    sectionId: string;
                    title: string;
                    nextRead: {
                        tool: string;
                        input: {
                            action: string;
                            documentId: string;
                            sectionId?: string;
                        };
                    };
                }[];
            }[];
            interpretation: string;
        };
    } | {
        usageGuide: any;
        publicApi: any;
        sharedTypes: any;
        documentation: {
            status: string;
            referenceOnly: boolean;
            creatorVersion?: never;
            entries?: never;
            interpretation?: never;
        } | {
            status: string;
            referenceOnly: boolean;
            creatorVersion: any;
            entries: {
                documentId: string;
                title: string;
                source: "internal" | "public";
                nextRead: {
                    tool: string;
                    input: {
                        action: string;
                        documentId: string;
                        sectionId?: string;
                    };
                };
                matchingSections: never[];
            }[];
            interpretation?: never;
        } | {
            status: string;
            referenceOnly: boolean;
            creatorVersion: any;
            entries: {
                documentId: string;
                title: string;
                source: "internal" | "public";
                nextRead: {
                    tool: string;
                    input: {
                        action: string;
                        documentId: string;
                        sectionId?: string;
                    };
                };
                matchingSections: {
                    sectionId: string;
                    title: string;
                    nextRead: {
                        tool: string;
                        input: {
                            action: string;
                            documentId: string;
                            sectionId?: string;
                        };
                    };
                }[];
            }[];
            interpretation: string;
        };
    };
    coverage: {
        sourcesComplete: boolean;
        sourceReadCount: number;
        fileNavigation: import("./edit-context-sources.js").SourceNavigation[];
        interpretation: string;
    };
    interpretation: string;
} | {
    catalogRevision?: never;
    candidates?: never;
    totalMatches?: never;
    candidatesTruncated?: never;
    status: string;
    target: EditingTarget;
    files: {
        path: string;
        content: string;
        hash: string;
        totalLines: number;
        rangeStatus?: string;
        firstOffset?: number;
        lastOffset?: number;
        nextOffset: number | null;
    }[];
    unavailableFiles: {
        path: string;
        code: string;
    }[];
    editingPolicy?: {
        pluginId: any;
        entryPath?: string;
        assetOwnership: any;
        implementationOwnership: "npm" | "project" | "unknown";
        projectEntryEdits: string;
        implementationTakeoverRequired: boolean | null;
    };
    references: {
        documentation: {
            status: string;
            referenceOnly: boolean;
            creatorVersion?: never;
            entries?: never;
            interpretation?: never;
        } | {
            status: string;
            referenceOnly: boolean;
            creatorVersion: any;
            entries: {
                documentId: string;
                title: string;
                source: "internal" | "public";
                nextRead: {
                    tool: string;
                    input: {
                        action: string;
                        documentId: string;
                        sectionId?: string;
                    };
                };
                matchingSections: never[];
            }[];
            interpretation?: never;
        } | {
            status: string;
            referenceOnly: boolean;
            creatorVersion: any;
            entries: {
                documentId: string;
                title: string;
                source: "internal" | "public";
                nextRead: {
                    tool: string;
                    input: {
                        action: string;
                        documentId: string;
                        sectionId?: string;
                    };
                };
                matchingSections: {
                    sectionId: string;
                    title: string;
                    nextRead: {
                        tool: string;
                        input: {
                            action: string;
                            documentId: string;
                            sectionId?: string;
                        };
                    };
                }[];
            }[];
            interpretation: string;
        };
    };
    coverage: {
        sourcesComplete: boolean;
        sourceReadCount: number;
        fileNavigation: import("./edit-context-sources.js").SourceNavigation[];
        interpretation: string;
    };
    interpretation: string;
}>;
export {};
//# sourceMappingURL=edit-context.d.ts.map