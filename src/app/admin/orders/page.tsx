import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { ArrowLeft, Package, Truck } from "lucide-react";
import { db } from "@/db";
import { orders, orderItems } from "@/db/schema";
import { requireStaffPage } from "@/lib/auth";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminOrders, type AdminOrder } from "@/components/admin/AdminOrders";
import { ORDER_STATUSES } from "@/lib/site";
import { formatMoney } from "@/lib/money";

export const metadata = {
  title: "Admin · order tracking",
  robots: { index: false, follow: false },
};

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireStaffPage("view", "/admin/orders");

  const { status } = await searchParams;
  const filter = status && (ORDER_STATUSES as readonly string[]).includes(status) ? status : undefined;

  const [orderRows, counts] = await Promise.all([
    db
      .select()
      .from(orders)
      .where(filter ? and(eq(orders.status, filter)) : undefined)
      .orderBy(desc(orders.createdAt))
      .limit(100),
    db
      .select({ status: orders.status, count: sql<number>`count(*)::int` })
      .from(orders)
      .groupBy(orders.status),
  ]);

  const countByStatus = new Map(counts.map((row) => [row.status, row.count]));
  const openCount = ORDER_STATUSES.filter((entry) => entry !== "delivered" && entry !== "cancelled").reduce(
    (sum, entry) => sum + (countByStatus.get(entry) ?? 0),
    0,
  );

  const ordersWithItems: AdminOrder[] = orderRows.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    company: order.company,
    email: order.email,
    status: order.status,
    total: order.total,
    shippingCarrier: order.shippingCarrier,
    shippingService: order.shippingService,
    trackingNumber: order.trackingNumber,
    trackingUrl: order.trackingUrl,
    createdAt: order.createdAt.toISOString(),
    taxExempt: order.taxExempt,
    isWholesale: order.isWholesale,
              paymentStatus: order.paymentStatus,
              paymentMethod: order.paymentMethod,
              poNumber: order.poNumber,
  }));

  const manifestCounts = await db
    .select({ orderId: orderItems.orderId, cases: sql<number>`sum(${orderItems.cases})::int` })
    .from(orderItems)
    .groupBy(orderItems.orderId);
  const caseByOrder = new Map(manifestCounts.map((row) => [row.orderId, row.cases]));

  return (
    <div>
      <section className="bg-ink text-cream">
        <div className="wrap flex flex-wrap items-end justify-between gap-4 py-8">
          <div>
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 text-[10.5px] font-bold text-cream/50 hover:text-cream"
            >
              <ArrowLeft size={12} /> Admin console
            </Link>
            <h1 className="display mt-2 text-[30px] leading-tight text-cream sm:text-[36px]">
              Order tracking
            </h1>
            <p className="mt-1.5 text-[11.5px] text-cream/55">
              Update fulfilment status, enter carrier tracking numbers, and notify the buyer
              automatically on ship.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/users" className="btn btn-sm border border-cream/25 text-cream hover:bg-cream/10">
              Accounts
            </Link>
            <Link href="/admin#applications" className="btn btn-light btn-sm">Applications</Link>
          </div>
        </div>
        <AdminNav />
      </section>

      <div className="wrap py-8">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/orders"
            className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
              !filter ? "border-ink bg-ink text-cream" : "border-ink/15 text-ink/60 hover:border-ink/40"
            }`}
          >
            All ({counts.reduce((sum, row) => sum + row.count, 0)})
          </Link>
          {ORDER_STATUSES.map((entry) => {
            const count = countByStatus.get(entry) ?? 0;
            return (
              <Link
                key={entry}
                href={`/admin/orders?status=${entry}`}
                className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold capitalize ${
                  filter === entry
                    ? "border-ink bg-ink text-cream"
                    : "border-ink/15 text-ink/60 hover:border-ink/40"
                }`}
              >
                {entry} ({count})
              </Link>
            );
          })}
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-fern/10 px-3 py-1.5 text-[10.5px] font-bold text-fern">
            <Truck size={12} /> {openCount} open
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { label: "Total booked", value: formatMoney(ordersWithItems.reduce((sum, order) => sum + order.total, 0), { decimals: false }) },
            {
              label: "Average order",
              value: formatMoney(
                ordersWithItems.length
                  ? Math.round(ordersWithItems.reduce((sum, order) => sum + order.total, 0) / ordersWithItems.length)
                  : 0,
              ),
            },
            {
              label: "Cases in view",
              value: `${ordersWithItems.reduce((sum, order) => sum + (caseByOrder.get(order.id) ?? 0), 0)}`,
            },
          ].map((stat) => (
            <div key={stat.label} className="card p-4">
              <p className="text-[10px] font-bold tracking-[0.12em] text-ink/40 uppercase">{stat.label}</p>
              <p className="display mt-1.5 text-[22px] leading-none">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <AdminOrders orders={ordersWithItems} />
        </div>

        {ordersWithItems.length === 0 ? (
          <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed border-ink/20 py-14 text-center">
            <Package size={26} className="text-ink/25" />
            <p className="text-[12.5px] font-bold">No {filter ?? "new"} orders in this view</p>
            <p className="max-w-sm text-[11px] text-ink/50">
              Orders appear here the moment a buyer completes checkout. Tracking numbers entered below
              are emailed to the customer automatically.
            </p>
            <Link href="/admin/orders" className="btn btn-outline btn-sm mt-1">Show all orders</Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
