import type { AgentUILocaleCode } from "@za38.03/agent-ui-plugins";

const zhCN = {
  salesReport: {
    heading: "月度销售",
    month: "月份",
    revenue: "收入",
    orderCount: "订单数量",
    hint: "点击收入表头切换排序，点击某一行查看该月订单数量",
    empty: "报表中没有可显示的月份数据。",
    unknown: "—",
    invalid: "报表数据格式不正确，无法显示。",
  },
};

const enUS: typeof zhCN = {
  salesReport: {
    heading: "Monthly sales",
    month: "Month",
    revenue: "Revenue",
    orderCount: "Order count",
    hint: "Select the revenue header to change sorting, then select a row to see that month's order count",
    empty: "This report contains no month rows.",
    unknown: "—",
    invalid: "The report data is not in a supported format.",
  },
};

const messages: Record<AgentUILocaleCode, typeof zhCN> = {
  "zh-CN": zhCN,
  "en-US": enUS,
};

export function getProjectMessages(locale: AgentUILocaleCode): typeof zhCN {
  return messages[locale] ?? messages["zh-CN"];
}
