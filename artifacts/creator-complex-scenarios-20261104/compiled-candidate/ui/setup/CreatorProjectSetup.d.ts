import { type CreatorLocaleMessages } from "../i18n/locale.js";
import type { CreatorProjectIssue, CreatorProjectMode, CreatorProjectSetupValidation, CreatorWorkspaceSetupInfo } from "../../workspace/types.js";
import "./creator-project-setup.css";
export interface CreatorSetupError {
    code?: string;
    message: string;
    details?: readonly CreatorProjectIssue[];
}
export interface CreatorSetupDraft {
    mode: CreatorProjectMode | null;
    sourceRoot: string;
    validation: {
        status: "idle";
    } | {
        status: "validating";
    } | {
        status: "valid";
        result: CreatorProjectSetupValidation;
    } | {
        status: "invalid";
        result: CreatorProjectSetupValidation;
    };
    initializing: boolean;
    error: CreatorSetupError | null;
}
export interface CreatorSetupInfoState {
    status: "idle" | "loading" | "ready" | "failed";
    info?: CreatorWorkspaceSetupInfo;
    error?: string;
}
export declare function setupIssueMessage(issue: CreatorProjectIssue, localeMessages?: CreatorLocaleMessages): string;
interface CreatorProjectSetupProps {
    infoState: CreatorSetupInfoState;
    draft: CreatorSetupDraft;
    canInitialize: boolean;
    debug: boolean;
    onModeChange(mode: CreatorProjectMode): void;
    onSourceRootChange(value: string): void;
    onInitialize(): void;
    onRetryInfo(): void;
}
export declare function CreatorProjectSetup({ infoState, draft, canInitialize, debug, onModeChange, onSourceRootChange, onInitialize, onRetryInfo, }: CreatorProjectSetupProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=CreatorProjectSetup.d.ts.map