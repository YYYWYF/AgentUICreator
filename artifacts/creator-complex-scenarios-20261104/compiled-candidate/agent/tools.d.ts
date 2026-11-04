import { type AgentMessages } from "./messages.js";
import { DebuggingEvidence } from "./debugging.js";
import { CreatorValidation } from "./validation.js";
import { RunActivity } from "./activity.js";
import { type EditingSelection, type EditingTarget } from "./editing-session.js";
import { type CreatorPostcondition } from "./outcome.js";
import { type RemovalTarget } from "./execution-decision.js";
import { ToolRecovery } from "./tool-recovery.js";
import { EvidenceProgress } from "./evidence-progress.js";
export interface ToolContext {
    documentationRoot?: string;
    contextWindow?: import("./context-window.js").CreatorContextWindow;
    root: string;
    skills: string;
    contracts: string;
    activity: RunActivity;
    readOnly: boolean;
    userMessage: string;
    threadId: string;
    signal: AbortSignal;
    groups: Set<string>;
    authorizedPlugins: Set<string>;
    diagnostics: Map<string, any>;
    verificationMode: string;
    requestRuntimeObservation?: (request: {
        requestId: string;
        currentHash: string;
        nodeIds?: string[];
        instanceIds?: string[];
    }) => Promise<void>;
    runtimeObservationRefresh?: {
        key: string;
        pending: Promise<{
            status: string;
            requestId: string;
        }>;
    };
    recovery?: ToolRecovery;
    cancelMarker?: string;
    executionDecision?: {
        status: "user_cancelled" | "needs_target_clarification";
        toolName: string;
        description?: string;
    };
    removalTarget?: RemovalTarget;
    pluginNames?: {
        pluginId: string;
        name?: string;
        targetNames?: readonly string[];
    }[];
    validation?: CreatorValidation;
    messages?: AgentMessages;
    evidenceRevision?: number;
    evidenceProgress?: EvidenceProgress;
    sourceSnapshots?: Map<string, import("./working-context.js").SourceSnapshot>;
    metrics?: {
        modelCalls: number;
        toolCalls: number;
    };
    debugging?: DebuggingEvidence;
    blocker?: {
        code: string;
        message: string;
    };
    toolObservations?: {
        toolName: string;
        status: string;
        reason?: string;
    }[];
    pluginPlans?: Map<string, {
        scopeHash: string;
        contract: any;
        workKind: string;
        status: string;
        sourceOnly?: boolean;
    }>;
    activePluginId?: string;
    behavior?: Map<string, any>;
    developmentDecision?: "adjust" | "defer";
    hostTools?: Map<string, (input: any) => any>;
    deliveries?: any[];
    readRanges?: Map<string, {
        hash: string;
        start: number;
        end: number;
    }[]>;
    editingSelection?: EditingSelection;
    pluginOwnerships?: Map<string, {
        pluginId: string;
        entryPath?: string;
        assetOwnership?: string;
        implementationOwnership: "npm" | "project" | "unknown";
    }>;
    editingTargets?: {
        target: EditingTarget;
        identity: string;
    }[];
    noChangeOutcome?: {
        toolName: string;
        status: "already_current" | "declined";
        identity: string;
        file?: {
            path: string;
            hash: string;
        };
        metadataOnly?: boolean;
        postconditions?: CreatorPostcondition[];
    };
}
export declare const TOOL_GROUPS: Record<string, string[]>;
export declare function visibleTool(name: string, context: ToolContext): boolean;
export declare function createTools(context: ToolContext): Promise<any[]>;
//# sourceMappingURL=tools.d.ts.map