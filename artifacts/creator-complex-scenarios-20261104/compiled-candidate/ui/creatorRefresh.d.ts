import { type CreatorLocaleMessages } from "./i18n/locale.js";
import type { UpdateInspection } from "@za38.03/agent-ui-creator/project/updates";
import type { AgentConnectionState } from "../agent-connection/types.js";
import type { CreatorMockState } from "../mock/types.js";
import type { MockDemoCompatibility } from "../mock/demo-compatibility.js";
export interface CreatorRefreshData {
    projectId: string;
    connection?: AgentConnectionState;
    mock?: CreatorMockState;
    compatibility?: MockDemoCompatibility;
    updates?: UpdateInspection;
}
export declare function publishCreatorRefresh(data: CreatorRefreshData): void;
export declare function useCreatorRefresh(apply: (data: CreatorRefreshData) => void): void;
export declare function readRefreshJson<T>(url: string, body?: unknown, localeMessages?: CreatorLocaleMessages): Promise<T>;
//# sourceMappingURL=creatorRefresh.d.ts.map