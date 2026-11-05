import { z } from "zod";

const orderItemSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().min(0),
  unit_price: z.number().min(0),
});

const orderSummarySchema = z
  .object({
    order_no: z.string().min(1),
    status: z.string().min(1),
    currency: z.string().min(1).default("CNY"),
    total_amount: z.number().min(0),
    items: z.array(orderItemSchema).default([]),
  })
  .transform((value) => ({
    orderNo: value.order_no,
    status: value.status,
    currency: value.currency.toUpperCase(),
    totalAmount: value.total_amount,
    items: value.items.map((item, index) => ({
      key: `${index}-${item.name}`,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      subtotal: Math.round(item.quantity * item.unit_price * 100) / 100,
    })),
  }));

export type OrderSummary = z.output<typeof orderSummarySchema>;

/** Raw payloads stay untyped until this runtime validation succeeds. */
export function parseOrderSummary(data: unknown) {
  return orderSummarySchema.safeParse(data);
}
