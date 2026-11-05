import { defineDataMessageUI, useAgentUILocaleCode } from "@za38.03/agent-ui-plugins";
import { useState } from "react";
import { getProjectMessages } from "../../application/i18n/messages";
import { parseOrderSummary } from "./schema";
import "./styles.css";

const VISIBLE_ITEM_LIMIT = 3;

function formatAmount(amount: number, currency: string, locale: string) {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

export function OrderSummaryMessage({ data }: { data: unknown }) {
  const localeCode = useAgentUILocaleCode();
  const labels = getProjectMessages(localeCode).orderSummary;
  const [expanded, setExpanded] = useState(false);
  const parsed = parseOrderSummary(data);

  if (!parsed.success) {
    return (
      <div className="aui-order-summary aui-order-summary--invalid" role="alert">
        <p className="aui-order-summary__invalid-text">{labels.invalid}</p>
      </div>
    );
  }

  const order = parsed.data;
  const format = (amount: number) => formatAmount(amount, order.currency, localeCode);
  const collapsible = order.items.length > VISIBLE_ITEM_LIMIT;
  const visibleItems = collapsible && !expanded ? order.items.slice(0, VISIBLE_ITEM_LIMIT) : order.items;
  const hiddenCount = order.items.length - visibleItems.length;

  return (
    <section className="aui-order-summary" aria-label={labels.heading}>
      <header className="aui-order-summary__header">
        <div className="aui-order-summary__heading">
          <span className="aui-order-summary__eyebrow">{labels.heading}</span>
          <span className="aui-order-summary__order-no">
            {labels.orderNo} {order.orderNo}
          </span>
        </div>
        <span className="aui-order-summary__status" data-status={order.status.toLowerCase()}>
          {labels.statusLabel(order.status)}
        </span>
      </header>

      <div className="aui-order-summary__items">
        <div className="aui-order-summary__items-head">
          <span>{labels.itemsHeading}</span>
          <span className="aui-order-summary__item-count">{labels.itemCount(order.items.length)}</span>
        </div>
        <ul className="aui-order-summary__item-list">
          {visibleItems.map((item) => (
            <li key={item.key} className="aui-order-summary__item">
              <div className="aui-order-summary__item-main">
                <span className="aui-order-summary__item-name">{item.name}</span>
                <span className="aui-order-summary__item-meta">
                  {labels.quantity} {item.quantity} · {labels.unitPrice} {format(item.unitPrice)}
                </span>
              </div>
              <span className="aui-order-summary__item-subtotal">{format(item.subtotal)}</span>
            </li>
          ))}
        </ul>
        {collapsible ? (
          <button
            type="button"
            className="aui-order-summary__toggle"
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? labels.collapse : labels.expandMore(hiddenCount)}
          </button>
        ) : null}
      </div>

      <footer className="aui-order-summary__footer">
        <span className="aui-order-summary__total-label">{labels.total}</span>
        <strong className="aui-order-summary__total-amount">{format(order.totalAmount)}</strong>
      </footer>
    </section>
  );
}

// The Data Message UI name must stay a static string literal: it is the backend
// CUSTOM event name that Runtime uses to resolve this renderer.
export const orderSummaryUI = defineDataMessageUI<unknown>({
  name: "app.order.summary",
  render: OrderSummaryMessage,
});
