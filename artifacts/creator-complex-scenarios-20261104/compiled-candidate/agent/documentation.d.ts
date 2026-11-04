export interface DocumentationInput {
    action?: "index" | "read";
    query?: string;
    topic?: string;
    source?: "public" | "internal";
    documentId?: string;
    sectionId?: string;
    offset?: number;
    limit?: number;
}
/** Packaged reference material only: never creates source observations or authority. */
export declare function readCreatorDocumentation(input?: DocumentationInput, directory?: string): Promise<{
    status: string;
    referenceOnly: boolean;
    reason: string;
} | {
    reason?: never;
    status: string;
    referenceOnly: boolean;
    creatorVersion: any;
    versions: any;
    sourceDigest: any;
    totalDocuments: number;
    topics: {
        source: string;
        topic: string;
        count: number;
    }[];
    navigation: string;
} | {
    referenceOnly: boolean;
    creatorVersion: any;
    versions: any;
    sourceDigest: any;
    status: string;
    reason: string;
} | {
    reason?: never;
    status: string;
    referenceOnly: boolean;
    creatorVersion: any;
    versions: any;
    sourceDigest: any;
    query: string;
    total: number;
    offset: number;
    entries: {
        documentId: string;
        title: string;
        source: "internal" | "public";
        topic: string;
        path: string;
        summary: string;
        sha256: string;
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
    nextOffset: number | null;
} | {
    referenceOnly: boolean;
    creatorVersion: any;
    versions: any;
    sourceDigest: any;
    status: string;
    documentId: string;
    reason: string;
} | {
    documentId: string;
    title: string;
    source: "internal" | "public";
    topic: string;
    path: string;
    summary: string;
    sha256: string;
    reason?: never;
    status: string;
    referenceOnly: boolean;
    creatorVersion: any;
    versions: any;
    sourceDigest: any;
    totalSections: number;
    offset: number;
    sections: {
        sectionId: string;
        title: string;
        level: number;
        characters: number;
        nextRead: {
            tool: string;
            input: {
                action: string;
                documentId: string;
                sectionId?: string;
            };
        };
    }[];
    nextOffset: number | null;
} | {
    referenceOnly: boolean;
    creatorVersion: any;
    versions: any;
    sourceDigest: any;
    status: string;
    reason: string;
    nextRead: {
        tool: string;
        input: {
            action: string;
            documentId: string;
            sectionId?: string;
        };
    };
} | {
    documentId: string;
    source: "internal" | "public";
    topic: string;
    path: string;
    summary: string;
    sha256: string;
    reason?: never;
    status: string;
    referenceOnly: boolean;
    creatorVersion: any;
    versions: any;
    sourceDigest: any;
    sectionId: string;
    title: string;
    offset: number;
    totalCharacters: number;
    childSections?: {
        sectionId: string;
        title: string;
        level: number;
        nextRead: {
            tool: string;
            input: {
                action: string;
                documentId: string;
                sectionId?: string;
            };
        };
    }[];
    moreSections?: {
        tool: string;
        input: {
            action: string;
            documentId: string;
            offset: number;
        };
    };
    content: string;
    nextOffset: number | null;
    nextRead?: {
        tool: string;
        input: {
            action: string;
            documentId: string;
            sectionId: string;
            offset: number;
            limit: number;
        };
    };
}>;
/** Small navigation hints in an editing bundle; article bodies remain on demand. */
export declare function editingDocumentation(pluginId: string | undefined, focus: string, directory?: string): Promise<{
    interpretation?: never;
    status: string;
    referenceOnly: boolean;
    creatorVersion?: never;
    entries?: never;
} | {
    interpretation?: never;
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
}>;
//# sourceMappingURL=documentation.d.ts.map