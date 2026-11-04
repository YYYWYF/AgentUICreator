import { enUS } from "../ui/i18n/en-US.js";
import { zhCN } from "../ui/i18n/zh-CN.js";
export const defaultAgentMessages = zhCN.creatorAgent;
export function agentMessages(locale) { return locale === "en-US" ? enUS.creatorAgent : defaultAgentMessages; }
//# sourceMappingURL=messages.js.map