import Link from "next/link";
import { and, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { inventoryMovements, orderItemLots, orderItems, orders, productLots, products, users } from "@/db/schema";
import { requireStaffPage } from "@/lib/auth";
import { addDays, EXPIRY_PULL_DAYS, EXPIRY_WARN_DAYS, isoDate, normaliseLotNumber } from "@/lib/inventory";
import { hasPermission } from "@/lib/staff";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminInventory, type InventoryLot, type InventoryProduct } from "@/components/admin/AdminInventory";
import { formatDateTime, formatIsoDate } from "@/lib/money";

export const metadata = {
  title: "Admin · inventory",
  robots: { index: false, follow: false },
};

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ lot?: string }> }) {
  const session = await requireStaffPage("view", "/admin/inventory");
  const { lot: lotQuery } = await searchParams;
  const lookup = lotQuery ? normaliseLotNumber(lotQuery) : "";

  const [productRows, lotRows, movementRows, recallRows] = await Promise.all([
    db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        stock: products.stock,
        reorderPoint: products.reorderPoint,
        active: products.active,
        taxClass: products.taxClass,
      })
      .from(products)
      .orderBy(products.name),
    db
      .select()
      .from(productLots)
      .where(or(gt(productLots.qtyOnHand, 0), gt(productLots.qtyQuarantine, 0), sql`${productLots.receivedAt} > now() - interval '90 days'`))
      .orderBy(sql`${productLots.expiresOn} asc nulls last`, productLots.receivedAt),
    db
      .select({
        movement: inventoryMovements,
        sku: products.sku,
        lotNumber: productLots.lotNumber,
        actor: users.email,
      })
      .from(inventoryMovements)
      .innerJoin(products, eq(products.id, inventoryMovements.productId))
      .leftJoin(productLots, eq(productLots.id, inventoryMovements.lotId))
      .leftJoin(users, eq(users.id, inventoryMovements.actorId))
      .orderBy(desc(inventoryMovements.createdAt), desc(inventoryMovements.id))
      .limit(60),
    lookup
      ? db
          .select({
            orderNumber: orders.orderNumber,
            company: orders.company,
            customerName: orders.customerName,
            email: orders.email,
            phone: orders.phone,
            status: orders.status,
            state: sql<string>`${orders.shippingAddress}->>'state'`,
            sku: orderItems.sku,
            cases: orderItemLots.cases,
            createdAt: orders.createdAt,
          })
          .from(orderItemLots)
          .innerJoin(orderItems, eq(orderItems.id, orderItemLots.orderItemId))
          .innerJoin(orders, eq(orders.id, orderItems.orderId))
          .where(and(eq(orderItemLots.lotNumber, lookup), inArray(orders.status, ["processing", "picking", "shipped", "delivered"])))
          .orderBy(desc(orders.createdAt))
      : Promise.resolve([]),
  ]);

  const warnBefore = isoDate(addDays(new Date(), EXPIRY_WARN_DAYS));
  const lots: InventoryLot[] = lotRows.map((lot) => ({
    id: lot.id,
    productId: lot.productId,
    lotNumber: lot.lotNumber,
    expiresOn: lot.expiresOn,
    supplier: lot.supplier,
    qtyReceived: lot.qtyReceived,
    qtyOnHand: lot.qtyOnHand,
    qtyQuarantine: lot.qtyQuarantine,
    status: lot.status,
    receivedAt: lot.receivedAt.toISOString(),
    expiringSoon: Boolean(lot.expiresOn && lot.expiresOn <= warnBefore && lot.status === "available"),
  }));
  const inventory: InventoryProduct[] = productRows.map((product) => ({ ...product, lots: lots.filter((lot) => lot.productId === product.id) }));
  const lowStock = inventory.filter((product) => product.active && product.stock <= product.reorderPoint);
  const expiring = lots.filter((lot) => lot.expiringSoon);
  const quarantined = lots.reduce((sum, lot) => sum + lot.qtyQuarantine, 0);

  return (
    <div>
      <section className="bg-ink text-cream">
        <div className="wrap py-8">
          <Link href="/admin" className="inline-flex items-center gap-1.5 text-[10.5px] font-bold text-cream/50 hover:text-cream">
            <ArrowLeft size={12} /> Admin console
          </Link>
          <h1 className="display mt-2 text-[30px] leading-tight text-cream sm:text-[36px]">Inventory &amp; lots</h1>
          <p className="mt-1.5 max-w-2xl text-[11.5px] text-cream/55">
            Stock lives in lots with best-by dates. Orders pick the earliest best-by first; lots within{" "}
            {EXPIRY_PULL_DAYS} days of best-by are pulled from sale automatically. Every change is a ledger entry.
          </p>
        </div>
        <AdminNav />
      </section>

      <div className="wrap py-8">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "At or below reorder point", value: lowStock.length },
            { label: `Lots expiring within ${EXPIRY_WARN_DAYS} days`, value: expiring.length },
            { label: "Cases in quarantine", value: quarantined },
          ].map((stat) => (
            <div key={stat.label} className="card p-4">
              <p className="text-[10px] font-bold tracking-[0.12em] text-ink/40 uppercase">{stat.label}</p>
              <p className={`display mt-1.5 text-[24px] leading-none ${stat.value ? "text-clay" : ""}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <AdminInventory products={inventory} canEdit={hasPermission(session, "inventory")} />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="card p-4" id="recall">
            <p className="text-[11px] font-bold tracking-[0.12em] uppercase">Recall lookup</p>
            <p className="mt-1 text-[10.5px] text-ink/50">Which buyers received a lot — for a recall or a supplier notice.</p>
            <form className="mt-3 flex gap-2" action="/admin/inventory#recall">
              <input name="lot" defaultValue={lookup} placeholder="Lot number" className="field max-w-[220px]" />
              <button className="btn btn-outline btn-sm" type="submit">Find orders</button>
            </form>
            {lookup ? (
              recallRows.length ? (
                <table className="mt-3 w-full text-left text-[11px]">
                  <thead className="text-[9px] font-bold tracking-[0.1em] text-ink/40 uppercase">
                    <tr>
                      <th className="py-1.5">Order</th>
                      <th>Buyer</th>
                      <th>State</th>
                      <th className="text-right">Cases</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recallRows.map((row) => (
                      <tr key={`${row.orderNumber}-${row.sku}`} className="border-t border-ink/8">
                        <td className="py-1.5">
                          <Link className="font-semibold hover:underline" href={`/admin/orders/${row.orderNumber}`}>{row.orderNumber}</Link>
                          <span className="block text-[9.5px] text-ink/45">{row.status} · {formatDateTime(row.createdAt)}</span>
                        </td>
                        <td>
                          {row.company ?? row.customerName}
                          <span className="block text-[9.5px] text-ink/45">{row.email}{row.phone ? ` · ${row.phone}` : ""}</span>
                        </td>
                        <td>{row.state}</td>
                        <td className="text-right tabular-nums">{row.cases}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="mt-3 text-[11px] text-ink/50">No open or shipped orders contain lot {lookup}.</p>
              )
            ) : null}
          </div>

          <div className="card p-4">
            <p className="text-[11px] font-bold tracking-[0.12em] uppercase">Stock ledger · latest 60</p>
            <ul className="mt-3 max-h-[420px] space-y-1.5 overflow-y-auto text-[11px]">
              {movementRows.map(({ movement, sku, lotNumber, actor }) => (
                <li key={movement.id} className="flex items-start justify-between gap-3 border-b border-ink/6 pb-1.5 last:border-0">
                  <div>
                    <p className="font-semibold">
                      {sku} · {lotNumber ?? "—"} · <span className="capitalize">{movement.reason}</span>
                      {movement.bucket === "quarantine" ? " (quarantine)" : ""}
                    </p>
                    <p className="text-[9.5px] text-ink/45">
                      {formatDateTime(movement.createdAt)} · {actor ?? "system"}
                      {movement.refType ? ` · ${movement.refType} ${movement.refId}` : ""}
                      {movement.note ? ` · ${movement.note}` : ""}
                    </p>
                  </div>
                  <span className={`font-bold tabular-nums ${movement.delta < 0 ? "text-clay" : movement.delta > 0 ? "text-fern" : "text-ink/40"}`}>
                    {movement.delta > 0 ? "+" : ""}
                    {movement.delta}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-4 text-[10px] text-ink/40">Best-by dates shown as entered ({formatIsoDate(isoDate(new Date()))} today).</p>
      </div>
    </div>
  );
}
