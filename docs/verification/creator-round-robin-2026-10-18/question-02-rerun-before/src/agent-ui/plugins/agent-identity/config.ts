import { enUS } from "../../agent-ui/i18n/locales/en-US";
import { zhCN } from "../../agent-ui/i18n/locales/zh-CN";
/** User configuration: custom names/descriptions are product content, not UI copy.
 * Default localized names are supplied by the agentIdentity locale namespace.
 * Set name to a string for a custom brand; set logo to an image URL.
 */
export interface AgentIdentityConfig {
  name: string | { readonly "en-US": string; readonly "zh-CN": string };
  logo?: string;
  description?: string;
}
export const agentIdentityConfig: AgentIdentityConfig = {
  name: { "en-US": enUS.agentIdentity.name, "zh-CN": zhCN.agentIdentity.name },
};
