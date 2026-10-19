import { sql } from "drizzle-orm";
import { db } from "@/db";
import { NEXUS_STATES } from "@/lib/tax";

/**
 * Sales-tax figures for filing (VRG-7). Months follow the business's clock (America/New_York).
 * Cancelled orders are left out; refunds on returns are reported in the month they were paid.
 */

export const REPORT_TZ = "America/New_York";

/** Common economic-nexus thresholds (many states: $100,000 or 200 transactions a year). */
export const NEXUS_WATCH = { revenue: 10_000_000, transactions: 200 };

export type NexusStateReport = {
  state: string;
  orders: number;
  grossSales: number;
  taxableGoods: number;
  taxableFreight: number;
  taxCollected: number;
  exemptFoodSupplement: number;
  exemptResale: number;
  freight: number;
  returnsGoods: number;
  returnsTax: number;
};

export type OtherStateReport = { state: string; orders: number; sales: number; watch: boolean };

export function parseMonth(value: string | undefined): string {
  if (value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return value;
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: REPORT_TZ }));
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export async function taxReport(month: string): Promise<{ month: string; nexus: NexusStateReport[]; others: OtherStateReport[] }> {
  const start = `${month}-01`;
  const inMonth = sql`(o.created_at at time zone ${REPORT_TZ}) >= ${start}::date and (o.created_at at time zone ${REPORT_TZ}) < (${start}::date + interval '1 month')`;

  const nexusList = sql.join(NEXUS_STATES.map((state) => sql`${state}`), sql`, `);
  const orderRows = await db.execute<{ state: string; orders: number; taxable_freight: number; tax_collected: number; freight: number }>(sql`
    select o.shipping_address->>'state' as state, count(*)::int as orders,
      coalesce(sum(o.shipping_taxable), 0)::int as taxable_freight,
      coalesce(sum(o.tax_amount), 0)::int as tax_collected,
      coalesce(sum(o.shipping_cost), 0)::int as freight
    from orders o
    where o.status <> 'cancelled' and ${inMonth} and o.shipping_address->>'state' in (${nexusList})
    group by 1
  `);
  const itemRows = await db.execute<{ state: string; gross_sales: number; taxable_goods: number; exempt_food_supplement: number; exempt_resale: number }>(sql`
    select o.shipping_address->>'state' as state,
      coalesce(sum(i.line_total - i.discount), 0)::int as gross_sales,
      coalesce(sum(i.taxable_amount), 0)::int as taxable_goods,
      coalesce(sum(i.line_total - i.discount) filter (where o.tax_source = 'state_rate' and i.taxable_amount = 0), 0)::int as exempt_food_supplement,
      coalesce(sum(i.line_total - i.discount) filter (where o.tax_source = 'exempt'), 0)::int as exempt_resale
    from orders o join order_items i on i.order_id = o.id
    where o.status <> 'cancelled' and ${inMonth} and o.shipping_address->>'state' in (${nexusList})
    group by 1
  `);

  const returnRows = await db.execute<{ state: string; goods: number; tax: number }>(sql`
    select o.shipping_address->>'state' as state, coalesce(sum(r.refund_goods), 0)::int as goods, coalesce(sum(r.refund_tax), 0)::int as tax
    from return_requests r join orders o on o.id = r.order_id
    where r.status = 'refunded'
      and (r.refunded_at at time zone ${REPORT_TZ}) >= ${start}::date and (r.refunded_at at time zone ${REPORT_TZ}) < (${start}::date + interval '1 month')
    group by o.shipping_address->>'state'
  `);
  const returnsByState = new Map(returnRows.rows.map((row) => [row.state, row]));

  const nexus: NexusStateReport[] = NEXUS_STATES.map((state) => {
    const order = orderRows.rows.find((entry) => entry.state === state);
    const item = itemRows.rows.find((entry) => entry.state === state);
    const returns = returnsByState.get(state);
    return {
      state,
      orders: Number(order?.orders ?? 0),
      grossSales: Number(item?.gross_sales ?? 0),
      taxableGoods: Number(item?.taxable_goods ?? 0),
      taxableFreight: Number(order?.taxable_freight ?? 0),
      taxCollected: Number(order?.tax_collected ?? 0),
      exemptFoodSupplement: Number(item?.exempt_food_supplement ?? 0),
      exemptResale: Number(item?.exempt_resale ?? 0),
      freight: Number(order?.freight ?? 0),
      returnsGoods: Number(returns?.goods ?? 0),
      returnsTax: Number(returns?.tax ?? 0),
    };
  });

  // Trailing twelve months by destination, for economic-nexus monitoring.
  const otherRows = await db.execute<{ state: string; orders: number; sales: number }>(sql`
    select o.shipping_address->>'state' as state, count(*)::int as orders,
      coalesce(sum(o.subtotal - o.account_discount - o.coupon_discount), 0)::bigint as sales
    from orders o
    where o.status <> 'cancelled' and o.created_at > now() - interval '12 months'
      and o.shipping_address->>'state' not in (${nexusList})
    group by o.shipping_address->>'state'
    order by sales desc
  `);
  const others = otherRows.rows.map((row) => ({
    state: row.state,
    orders: Number(row.orders),
    sales: Number(row.sales),
    watch: Number(row.sales) >= NEXUS_WATCH.revenue * 0.75 || Number(row.orders) >= NEXUS_WATCH.transactions * 0.75,
  }));

  return { month, nexus, others };
}

export function taxReportCsv(report: Awaited<ReturnType<typeof taxReport>>): string {
  const dollars = (cents: number) => (cents / 100).toFixed(2);
  const lines = [
    ["month", "state", "orders", "gross_sales", "taxable_goods", "taxable_freight", "exempt_food_supplement", "exempt_resale", "freight", "tax_collected", "returns_goods", "returns_tax"].join(","),
    ...report.nexus.map((row) =>
      [
        report.month,
        row.state,
        row.orders,
        dollars(row.grossSales),
        dollars(row.taxableGoods),
        dollars(row.taxableFreight),
        dollars(row.exemptFoodSupplement),
        dollars(row.exemptResale),
        dollars(row.freight),
        dollars(row.taxCollected),
        dollars(row.returnsGoods),
        dollars(row.returnsTax),
      ].join(","),
    ),
  ];
  return `${lines.join("\n")}\n`;
}
