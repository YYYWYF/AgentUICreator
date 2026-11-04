import type { AgentUILocaleCode } from "@za38.03/agent-ui-plugins";

export type SalesReportMessages = {
  heading: string;
  invalid: string;
  month: string;
  revenue: string;
  orders: (count: number) => string;
  sortAscending: string;
  sortDescending: string;
  expand: (month: string) => string;
  collapse: (month: string) => string;
};

/** 统一领域文案：en-US 与 zh-CN 必须保持同构。 */
const messages: Record<AgentUILocaleCode, SalesReportMessages> = {
  "zh-CN": {
    heading: "月度销售",
    invalid: "报表数据格式不正确，暂时无法展示这张销售报表。",
    month: "月份",
    revenue: "收入",
    orders: (count: number) => `订单数：${count}`,
    sortAscending: "按收入升序排列",
    sortDescending: "按收入降序排列",
    expand: (month: string) => `查看 ${month} 的订单数量`,
    collapse: (month: string) => `收起 ${month} 的订单数量`,
  },
  "en-US": {
    heading: "Monthly sales",
    invalid: "The sales report data is not in a supported format.",
    month: "Month",
    revenue: "Revenue",
    orders: (count: number) => `Orders: ${count}`,
    sortAscending: "Sort by revenue, ascending",
    sortDescending: "Sort by revenue, descending",
    expand: (month: string) => `Show order count for ${month}`,
    collapse: (month: string) => `Hide order count for ${month}`,
  },
};

export function getSalesReportMessages(localeCode: AgentUILocaleCode): SalesReportMessages {
  return messages[localeCode] ?? messages["zh-CN"];
}
