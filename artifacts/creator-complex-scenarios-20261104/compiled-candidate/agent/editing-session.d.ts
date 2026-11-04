import type { ToolContext } from "./tools.js";
export interface EditingTarget {
    id: string;
    kind: "plugin_source" | "application_config" | "project_file";
    name: string;
    entryPath: string;
    pluginId?: string;
    definitionPath?: string;
    manifestPath?: string;
}
export interface EditingSelection {
    target: EditingTarget;
    identity: string;
    guards: string;
    filePaths: string[];
}
/** Fingerprint navigation inputs only. No cached types, validation or authority are reused. */
export declare function editingProjectIdentity(root: string): Promise<string>;
export declare function selectEditingTarget(context: ToolContext, target: EditingTarget, filePaths?: string[], identity?: string): Promise<void>;
/** Navigation follows observed files, never guessed intent or an operation plan. */
export declare function rememberProjectTargets(context: ToolContext, inspection: Record<string, any>): Promise<void>;
/** Bounded, process-local navigation memory, deliberately separate from graph checkpoints. */
export declare class EditingSessionStore {
    private readonly now;
    private readonly ttlMs;
    private readonly maxEntries;
    private readonly entries;
    constructor(now?: () => number, ttlMs?: number, maxEntries?: number);
    private key;
    forget(context: Pick<ToolContext, "root" | "threadId">): Promise<void>;
    remember(context: ToolContext): Promise<void>;
    prepare(context: ToolContext): Promise<{
        status: "stale";
        reason: string;
    } | {
        status: "fresh";
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
        previousChange: {
            runId: string;
            staticallyVerified: boolean;
            changes: {
                path: string;
                before: string;
                after: string;
            }[];
        };
        interpretation: string;
    } | undefined>;
}
//# sourceMappingURL=editing-session.d.ts.map