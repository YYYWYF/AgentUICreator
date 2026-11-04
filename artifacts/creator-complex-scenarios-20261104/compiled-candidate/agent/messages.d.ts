import { zhCN } from "../ui/i18n/zh-CN.js";
export type AgentMessages = {
    [Key in keyof typeof zhCN.creatorAgent]: string;
};
export declare const defaultAgentMessages: AgentMessages;
export declare function agentMessages(locale?: string): AgentMessages;
//# sourceMappingURL=messages.d.ts.map