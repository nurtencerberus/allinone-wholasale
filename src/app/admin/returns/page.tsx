import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { orderItems, orders, products, returnItems, returnRequests } from "@/db/schema";
import { requireStaffPage } from "@/lib/auth";
import { hasPermission } from "@/lib/staff";
import { computeReturnRefund, RETURN_WINDOW_DAYS } from "@/lib/order-admin";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminReturns, type AdminReturn } from "@/components/admin/AdminReturns";

export const metadata = {
  title: "Admin · returns",
  robots: { index: false, follow: false },
};

export default async function ReturnsPage() {
  const staff = await requireStaffPage("view", "/admin/returns");
  const rows = await db
    .select({ rma: returnRequests, order: orders })
    .from(returnRequests)
    .innerJoin(orders, eq(orders.id, returnRequests.orderId))
    .orderBy(desc(returnRequests.createdAt))
    .limit(200);
  const ids = rows.map((row) => row.rma.id);
  const items = ids.length
    ? await db
        .select({ item: returnItems, line: orderItems, taxClass: products.taxClass })
        .from(returnItems)
        .innerJoin(orderItems, eq(orderItems.id, returnItems.orderItemId))
        .leftJoin(products, eq(products.id, orderItems.productId))
        .where(inArray(returnItems.returnId, ids))
    : [];

  const returns: AdminReturn[] = await Promise.all(
    rows.map(async ({ rma, order }) => {
      const preview =
        rma.status === "received"
          ? await Promise.all([computeReturnRefund(rma.id, false), computeReturnRefund(rma.id, true)])
          : null;
      return {
        id: rma.id,
        rmaNumber: rma.rmaNumber,
        status: rma.status,
        reason: rma.reason,
        customerNote: rma.customerNote,
        adminNote: rma.adminNote,
        createdAt: rma.createdAt.toISOString(),
        orderNumber: order.orderNumber,
        buyer: order.company ?? order.customerName,
        refunded: rma.refundGoods + rma.refundTax + rma.refundShipping,
        refundRef: rma.refundRef,
        preview: preview ? { without: preview[0].total, withShipping: preview[1].total, tax: preview[0].tax } : null,
        items: items
          .filter((entry) => entry.item.returnId === rma.id)
          .map((entry) => ({
            id: entry.item.id,
            name: entry.line.name,
            sku: entry.line.sku,
            cases: entry.item.cases,
            condition: entry.item.condition,
            disposition: entry.item.disposition,
            perishable: (entry.taxClass ?? "general") !== "general",
          })),
      };
    }),
  );

  return (
    <div>
      <section className="bg-ink text-cream">
        <div className="wrap py-8">
          <Link href="/admin" className="inline-flex items-center gap-1.5 text-[10.5px] font-bold text-cream/50 hover:text-cream">
            <ArrowLeft size={12} /> Admin console
          </Link>
          <h1 className="display mt-2 text-[30px] leading-tight text-cream sm:text-[36px]">Returns (RMA)</h1>
          <p className="mt-1.5 max-w-2xl text-[11.5px] text-cream/55">
            {RETURN_WINDOW_DAYS}-day returns, opened supplements and food included. Opened or damaged cartons never go back
            on sale — they are quarantined or destroyed, and the lot record shows it.
          </p>
        </div>
        <AdminNav />
      </section>
      <div className="wrap py-8">
        <AdminReturns returns={returns} canHandle={hasPermission(staff, "orders")} canRefund={hasPermission(staff, "payments")} />
      </div>
    </div>
  );
}
