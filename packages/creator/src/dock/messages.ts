import { enUS } from "../ui/i18n/en-US.js";
import { zhCN } from "../ui/i18n/zh-CN.js";

export type CreatorDockMessages = typeof zhCN.creatorDock;
/** Presentation helpers share Creator's catalogs, with no independent locale hook. */
export function creatorDockMessages(locale: string): CreatorDockMessages {
  const catalogs: Record<string, CreatorDockMessages> = { "en-US": enUS.creatorDock, "zh-CN": zhCN.creatorDock };
  return catalogs[locale] ?? zhCN.creatorDock;
}
