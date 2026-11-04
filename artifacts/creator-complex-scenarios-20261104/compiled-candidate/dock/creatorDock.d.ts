import type { CreatorDockMessages } from "./messages.js";
export { creatorDockMessages } from "./messages.js";
export declare const CREATOR_DOCK_ID = "agent-ui-creator-dock";
/** Development-only entry. The iframe owns the UI; Shadow DOM isolates the tab. */
export declare function installCreatorDock({ creatorUrl, workspaceId, messages, initiallyOpen }: {
    creatorUrl: string;
    workspaceId?: string | undefined;
    messages: CreatorDockMessages;
    initiallyOpen?: boolean;
}): () => void;
//# sourceMappingURL=creatorDock.d.ts.map