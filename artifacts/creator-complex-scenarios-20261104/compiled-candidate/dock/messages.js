import { enUS } from "../ui/i18n/en-US.js";
import { zhCN } from "../ui/i18n/zh-CN.js";
/** Presentation helpers share Creator's catalogs, with no independent locale hook. */
export function creatorDockMessages(locale) {
    const catalogs = { "en-US": enUS.creatorDock, "zh-CN": zhCN.creatorDock };
    return catalogs[locale] ?? zhCN.creatorDock;
}
//# sourceMappingURL=messages.js.map