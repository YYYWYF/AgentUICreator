export interface UpdateNotificationStateStore {
    isDismissed(projectId: string, fingerprint: string): boolean;
    dismiss(projectId: string, fingerprint: string): void;
}
export declare class LocalUpdateNotificationStateStore implements UpdateNotificationStateStore {
    isDismissed(projectId: string, fingerprint: string): boolean;
    dismiss(projectId: string, fingerprint: string): void;
}
export declare function CreatorPluginUpdates({ workspaceId, busy, modelReady, checkRequest, notificationTarget, pageOpen: controlledPageOpen, onPageChange, onModelMerge }: {
    workspaceId: string;
    busy: boolean;
    modelReady: boolean;
    checkRequest: number;
    notificationTarget?: HTMLElement | null;
    pageOpen?: boolean;
    onPageChange: (open: boolean) => void;
    onModelMerge: (prompt: string) => void;
}): import("react").JSX.Element;
//# sourceMappingURL=CreatorPluginUpdates.d.ts.map