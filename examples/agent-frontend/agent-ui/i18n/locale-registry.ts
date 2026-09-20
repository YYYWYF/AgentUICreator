import { enUS, zhCN } from "./locales";
import type {
  AgentUIDirection,
  AgentUILocaleCode,
  AgentUILocaleMessages,
} from "./locale-types";

export const AGENT_UI_LOCALES = {
  "zh-CN": zhCN,
  "en-US": enUS,
} satisfies Record<AgentUILocaleCode, AgentUILocaleMessages>;

export const AGENT_UI_LOCALE_METADATA = {
  "zh-CN": { direction: "ltr" },
  "en-US": { direction: "ltr" },
} satisfies Record<AgentUILocaleCode, { direction: AgentUIDirection }>;
