import type { AgentUILocaleCode } from "@za38.03/agent-ui-plugins";

/**
 * Project-owned business copy. Keep both locales complete (en-US / zh-CN) and
 * select them with the unified useAgentUILocaleCode() value.
 */
export type ProjectMessages = {
  orderSummary: {
    heading: string;
    orderNo: string;
    itemsHeading: string;
    quantity: string;
    unitPrice: string;
    total: string;
    collapse: string;
    invalid: string;
    expandMore: (hiddenCount: number) => string;
    itemCount: (count: number) => string;
    statusLabel: (status: string) => string;
  };
};

const STATUS_LABELS_ZH: Record<string, string> = {
  paid: "已支付",
  unpaid: "待支付",
  pending: "待支付",
  processing: "处理中",
  shipped: "已发货",
  delivered: "已送达",
  completed: "已完成",
  refunded: "已退款",
  cancelled: "已取消",
  canceled: "已取消",
  closed: "已关闭",
};

const STATUS_LABELS_EN: Record<string, string> = {
  paid: "Paid",
  unpaid: "Unpaid",
  pending: "Pending",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  completed: "Completed",
  refunded: "Refunded",
  cancelled: "Cancelled",
  canceled: "Cancelled",
  closed: "Closed",
};

const zhCN: ProjectMessages = {
  orderSummary: {
    heading: "订单摘要",
    orderNo: "订单号",
    itemsHeading: "商品",
    quantity: "数量",
    unitPrice: "单价",
    total: "合计金额",
    collapse: "收起商品清单",
    invalid: "订单数据格式不正确，暂时无法显示订单卡片。",
    expandMore: (hiddenCount) => `展开其余 ${hiddenCount} 件商品`,
    itemCount: (count) => `共 ${count} 件`,
    statusLabel: (status) => STATUS_LABELS_ZH[status.toLowerCase()] ?? status,
  },
};

const enUS: ProjectMessages = {
  orderSummary: {
    heading: "Order summary",
    orderNo: "Order no.",
    itemsHeading: "Items",
    quantity: "Qty",
    unitPrice: "Unit price",
    total: "Total",
    collapse: "Show less",
    invalid: "The order data could not be read, so the order card is unavailable.",
    expandMore: (hiddenCount) => `Show ${hiddenCount} more item${hiddenCount === 1 ? "" : "s"}`,
    itemCount: (count) => `${count} item${count === 1 ? "" : "s"}`,
    statusLabel: (status) => STATUS_LABELS_EN[status.toLowerCase()] ?? status,
  },
};

const messages: Record<AgentUILocaleCode, ProjectMessages> = {
  "zh-CN": zhCN,
  "en-US": enUS,
};

export function getProjectMessages(locale: AgentUILocaleCode): ProjectMessages {
  return messages[locale] ?? zhCN;
}
