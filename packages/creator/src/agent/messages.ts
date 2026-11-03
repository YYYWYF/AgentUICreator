import { enUS } from "../ui/i18n/en-US.js";
import { zhCN } from "../ui/i18n/zh-CN.js";

export type AgentMessages = { [Key in keyof typeof zhCN.creatorAgent]: string };
export const defaultAgentMessages: AgentMessages = zhCN.creatorAgent;
export function agentMessages(locale?: string): AgentMessages { return locale === "en-US" ? enUS.creatorAgent : defaultAgentMessages; }
