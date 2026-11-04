/**
 * Project-owned UI copy shared by application Plugin code.
 * Every entry keeps en-US / zh-CN parity.
 */
const zhCN = {
  salesReport: {
    fallbackTitle: "月度销售",
    month: "月份",
    revenue: "收入",
    orderCount: "订单数量",
    emptyRows: "报表中没有可展示的月度数据。",
    invalid: "报表数据格式不正确。",
    unsupportedFormat: "暂不支持该报表格式。",
    sortRevenueAscending: "按收入从低到高排序",
    sortRevenueDescending: "按收入从高到低排序",
  },
};

export type ProjectMessages = typeof zhCN;

const enUS: ProjectMessages = {
  salesReport: {
    fallbackTitle: "Monthly sales",
    month: "Month",
    revenue: "Revenue",
    orderCount: "Orders",
    emptyRows: "This report has no monthly rows to display.",
    invalid: "Invalid sales report data.",
    unsupportedFormat: "Unsupported report format.",
    sortRevenueAscending: "Sort by revenue ascending",
    sortRevenueDescending: "Sort by revenue descending",
  },
};

const projectMessages: Record<string, ProjectMessages> = {
  "zh-CN": zhCN,
  "en-US": enUS,
};

export function getProjectMessages(locale: string): ProjectMessages {
  return projectMessages[locale] ?? zhCN;
}
