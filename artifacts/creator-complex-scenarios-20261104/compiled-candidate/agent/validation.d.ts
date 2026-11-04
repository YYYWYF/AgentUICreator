import type { RunActivity } from "./activity.js";
import { type DebuggingEvidence } from "./debugging.js";
interface Check {
    command: string;
    status: "passed" | "failed";
    exitCode: number | null;
    output: string;
    truncated: boolean;
    revision: number;
}
export declare class CreatorValidation {
    readonly root: string;
    readonly activity: RunActivity;
    readonly signal: () => AbortSignal;
    readonly debugging?: DebuggingEvidence | undefined;
    private baseline;
    private checked;
    constructor(root: string, activity: RunActivity, signal: () => AbortSignal, debugging?: DebuggingEvidence | undefined);
    ensureBaseline(): Promise<{
        staticErrors: Set<string>;
        typeErrors: Set<string>;
        typeCheck: Check;
    }>;
    validate({ includeBuild, mode, force }: {
        includeBuild?: boolean;
        mode?: "delta" | "clean";
        force?: boolean;
    }): Promise<any>;
    inspectStatic(): Promise<{
        revision: number;
        structural: Record<string, any>;
        check: Check;
        diagnostics: {
            targetId: string;
            debuggingTargetId: string;
            message: string;
            file: string | undefined;
            revision: number;
        }[];
    }>;
    behavior(pluginId: string, interactions: string[]): Promise<{
        status: string;
        revision: number;
        pluginId: string;
        requiredTests: string[];
        missingTests: string[];
        passedTests: string[];
    }>;
    private script;
    private execute;
}
export {};
//# sourceMappingURL=validation.d.ts.map