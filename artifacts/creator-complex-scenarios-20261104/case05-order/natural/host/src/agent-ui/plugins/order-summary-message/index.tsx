import { useAgentUILocaleCode } from "@za38.03/agent-ui-plugins";
import type { DataMessageUIRenderProps } from "@za38.03/agent-ui-plugins";
import { useId, useState } from "react";
import "./styles.css";

export interface OrderSummaryItem {
  name?: string;
  quantity?: number;
  unit_price?: number;
}

export interface OrderSummaryData {
  order_no?: string;
  status?: string;
  currency?: string;
  total_amount?: number;
  items?: OrderSummaryItem[];
}

/** Items shown while the card is collapsed; longer orders get an expand toggle. */
const COLLAPSED_ITEM_LIMIT = 3;

type LocaleMessages = {
  cardLabel: string;
  orderNoLabel: string;
  itemsLabel: string;
  totalLabel: string;
  perUnit: string;
  emptyItems: string;
  unknownValue: string;
  expand: (hiddenCount: number) => string;
  collapse: string;
  statuses: Record<string, string>;
};

const messages: Record<string, LocaleMessages> = {
  "zh-CN": {
    cardLabel: "订单摘要",
    orderNoLabel: "订单号",
    itemsLabel: "商品",
    totalLabel: "合计",
    perUnit: "件",
    emptyItems: "暂无商品信息",
    unknownValue: "—",
    expand: (hiddenCount) => `展开其余 ${hiddenCount} 件商品`,
    collapse: "收起商品列表",
    statuses: {
      paid: "已支付",
      pending: "待支付",
      unpaid: "未支付",
      processing: "处理中",
      shipped: "已发货",
      completed: "已完成",
      cancelled: "已取消",
      canceled: "已取消",
      refunded: "已退款",
      closed: "已关闭",
    },
  },
  "en-US": {
    cardLabel: "Order summary",
    orderNoLabel: "Order number",
    itemsLabel: "Items",
    totalLabel: "Total",
    perUnit: "each",
    emptyItems: "No items available",
    unknownValue: "—",
    expand: (hiddenCount) =>
      `Show ${hiddenCount} more ${hiddenCount === 1 ? "item" : "items"}`,
    collapse: "Collapse items",
    statuses: {
      paid: "Paid",
      pending: "Awaiting payment",
      unpaid: "Unpaid",
      processing: "Processing",
      shipped: "Shipped",
      completed: "Completed",
      cancelled: "Cancelled",
      canceled: "Cancelled",
      refunded: "Refunded",
      closed: "Closed",
    },
  },
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function asText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asItems(value: unknown): OrderSummaryItem[] {
  if (!Array.isArray(value)) return [];
  const items: OrderSummaryItem[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) continue;
    const name = asText(record.name);
    const quantity = asNumber(record.quantity);
    const unitPrice = asNumber(record.unit_price);
    if (name === undefined && quantity === undefined && unitPrice === undefined) {
      continue;
    }
    items.push({ name, quantity, unit_price: unitPrice });
  }
  return items;
}

function formatMoney(
  amount: number | undefined,
  currency: string | undefined,
  locale: string,
): string | undefined {
  if (amount === undefined) return undefined;
  const code =
    currency !== undefined && /^[A-Za-z]{3}$/.test(currency)
      ? currency.toUpperCase()
      : undefined;
  if (code !== undefined) {
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: code,
      }).format(amount);
    } catch {
      // Unknown currency code for Intl: fall back to a plain formatted number.
    }
  }
  const value = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  }).format(amount);
  return code === undefined ? value : `${value} ${code}`;
}

export function OrderSummaryMessagePlugin({
  data,
}: DataMessageUIRenderProps<OrderSummaryData>) {
  const localeCode = useAgentUILocaleCode();
  const text = messages[localeCode] ?? messages["zh-CN"];
  const locale = localeCode === "en-US" ? "en-US" : "zh-CN";
  const [expanded, setExpanded] = useState(false);
  const itemsId = useId();

  const record = asRecord(data);
  const orderNo = asText(record?.order_no);
  const statusKey = asText(record?.status)?.toLowerCase();
  const currency = asText(record?.currency);
  const totalAmount = asNumber(record?.total_amount);
  const items = asItems(record?.items);

  const statusLabel =
    statusKey === undefined ? undefined : (text.statuses[statusKey] ?? statusKey);
  const totalText = formatMoney(totalAmount, currency, locale);
  const hiddenCount = items.length - COLLAPSED_ITEM_LIMIT;
  const canExpand = hiddenCount > 0;
  const visibleItems =
    canExpand && !expanded ? items.slice(0, COLLAPSED_ITEM_LIMIT) : items;

  return (
    <section className="order-summary" aria-label={text.cardLabel}>
      <header className="order-summary__header">
        <div className="order-summary__identity">
          <span className="order-summary__caption">{text.orderNoLabel}</span>
          <span className="order-summary__order-no">
            {orderNo ?? text.unknownValue}
          </span>
        </div>
        {statusLabel === undefined ? null : (
          <span className="order-summary__status" data-status={statusKey}>
            {statusLabel}
          </span>
        )}
      </header>

      <div className="order-summary__body">
        <h3 className="order-summary__section-title">{text.itemsLabel}</h3>
        {items.length === 0 ? (
          <p className="order-summary__empty">{text.emptyItems}</p>
        ) : (
          <ul className="order-summary__items" id={itemsId}>
            {visibleItems.map((item, index) => {
              const unitPrice = formatMoney(item.unit_price, currency, locale);
              return (
                <li
                  className="order-summary__item"
                  key={`${item.name ?? "item"}-${index}`}
                >
                  <span className="order-summary__item-name">
                    {item.name ?? text.unknownValue}
                  </span>
                  <span className="order-summary__item-meta">
                    {item.quantity === undefined ? null : (
                      <span className="order-summary__item-quantity">
                        {`×${item.quantity}`}
                      </span>
                    )}
                    {unitPrice === undefined ? null : (
                      <span className="order-summary__item-price">
                        {`${unitPrice} / ${text.perUnit}`}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {canExpand ? (
          <button
            type="button"
            className="order-summary__toggle"
            aria-expanded={expanded}
            aria-controls={itemsId}
            onClick={() => setExpanded((value) => !value)}
          >
            <span className="order-summary__toggle-indicator" aria-hidden="true">
              {expanded ? "▾" : "▸"}
            </span>
            <span>
              {expanded ? text.collapse : text.expand(hiddenCount)}
            </span>
          </button>
        ) : null}
      </div>

      <footer className="order-summary__footer">
        <span className="order-summary__total-label">{text.totalLabel}</span>
        <span className="order-summary__total-amount">
          {totalText ?? text.unknownValue}
        </span>
      </footer>
    </section>
  );
}
