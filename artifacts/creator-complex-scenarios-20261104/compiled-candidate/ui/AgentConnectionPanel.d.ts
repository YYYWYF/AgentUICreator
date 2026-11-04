import { type CreatorLocaleMessages } from "./i18n/locale.js";
import { type AgentConnectionState } from "../agent-connection/types.js";
export declare const CONNECTION_CHANGED = "agent-ui-creator:connection-changed";
export declare function readAgentConnection(workspaceId: string, body?: unknown, localeMessages?: CreatorLocaleMessages): Promise<AgentConnectionState>;
export declare function AgentConnectionPanel({ workspaceId, visible }: {
    workspaceId: string;
    visible: boolean;
}): import("react").JSX.Element | null;
//# sourceMappingURL=AgentConnectionPanel.d.ts.map