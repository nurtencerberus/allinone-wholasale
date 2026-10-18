import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, sql } from "drizzle-orm";
import {
  AlertTriangle,
  BadgeCheck,
  Boxes,
  DollarSign,
  Percent,
  Package,
  ShieldCheck,
  Truck,
  UserCog,
  Users,
} from "lucide-react";
import { db } from "@/db";
import { orders, products, users, wholesaleApplications } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminApplications } from "@/components/admin/AdminApplications";
import { AdminOrders } from "@/components/admin/AdminOrders";
import { formatMoney } from "@/lib/money";

export const metadata = {
  title: "Admin console",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin");

  if (user.role !== "admin") {
    return (
      <div className="wrap flex min-h-[55vh] flex-col items-center justify-center py-16 text-center">
        <span className="rounded-full bg-clay/10 p-3.5 text-clay">
          <AlertTriangle size={24} />
        </span>
        <h1 className="display mt-4 text-[30px]">Admin access required</h1>
        <p className="mt-2 max-w-md text-[12.5px] leading-relaxed text-ink/60">
          You are signed in as {user.email}. This portal is restricted to Meridian trade operations staff.
          Use the seeded admin account to review applications, buyers and shipments.
        </p>
        <div className="mt-5 flex gap-2">
          <Link href="/account" className="btn btn-primary btn-sm">Go to my account</Link>
          <Link href="/login?next=/admin" className="btn btn-outline btn-sm">Switch account</Link>
        </div>
      </div>
    );
  }

  const [applicationRows, orderRows, stats, inventory, accountRows] = await Promise.all([
    db.select().from(wholesaleApplications).orderBy(desc(wholesaleApplications.createdAt)),
    db.select().from(orders).orderBy(desc(orders.createdAt)).limit(40),
    Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(users),
      db.select({ count: sql<number>`count(*)::int` }).from(wholesaleApplications).where(sql`status = 'pending'`),
      db.select({ sum: sql<number>`coalesce(sum(total),0)::int` }).from(orders),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(orders)
        .where(sql`status in ('processing','picking','shipped')`),
    ]),
    db.select({ stock: products.stock, slug: products.slug, name: products.name }).from(products),
    db.select({ tier: users.accountTier, verified: users.emailVerified }).from(users),
  ]);

  const [{ count: accountCount } = { count: 0 }] = stats[0];
  const [{ count: pendingCount } = { count: 0 }] = stats[1];
  const [{ sum: revenue } = { sum: 0 }] = stats[2];
  const [{ count: openOrders } = { count: 0 }] = stats[3];
  const lowStock = inventory.filter((item) => item.stock <= 10);
  const wholesaleCount = accountRows.filter((account) => account.tier === "wholesale").length;
  const unverifiedCount = accountRows.filter((account) => !account.verified).length;

  const integrations = [
    { label: "Stripe Elements", ok: Boolean(process.env.STRIPE_SECRET_KEY && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY), note: "PCI-DSS tokenised payments" },
    { label: "TaxJar sales tax", ok: Boolean(process.env.TAXJAR_API_KEY), note: "Falls back to nexus table" },
    { label: "EasyPost freight", ok: Boolean(process.env.EASYPOST_API_KEY), note: "Falls back to dimensional matrix" },
    { label: "Resend email", ok: Boolean(process.env.RESEND_API_KEY), note: "Dev links logged to console" },
  ];

  return (
    <div>
      <section className="bg-ink text-cream">
        <div className="wrap flex flex-wrap items-end justify-between gap-4 py-9">
          <div>
            <p className="text-[10.5px] font-bold tracking-[0.24em] text-gold uppercase">Operations portal</p>
            <h1 className="display mt-2 text-[32px] leading-tight text-cream sm:text-[38px]">Admin console</h1>
            <p className="mt-1.5 text-[12px] text-cream/55">
              Signed in as {user.name} · {user.email}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/users" className="btn btn-light btn-sm">
              <Users size={13} /> Users
            </Link>
            <Link href="/admin/orders" className="btn btn-light btn-sm">
              <Package size={13} /> Orders
            </Link>
            <Link href="/shop" className="btn btn-sm border border-cream/25 text-cream hover:bg-cream/10">
              View storefront
            </Link>
          </div>
        </div>
        <AdminNav />
      </section>

      <div className="wrap py-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Pending applications", value: `${pendingCount}`, icon: BadgeCheck, tone: pendingCount ? "text-clay" : "" },
            { label: "Open shipments", value: `${openOrders}`, icon: Truck },
            { label: "Lifetime order value", value: formatMoney(revenue, { decimals: false }), icon: DollarSign },
            { label: "Registered accounts", value: `${accountCount}`, icon: Users },
          ].map((stat) => (
            <Link key={stat.label} href={stat.label === "Registered accounts" ? "/admin/users" : "/admin/orders"} className="card block p-4 transition-colors hover:border-ink/25">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold tracking-[0.12em] text-ink/40 uppercase">{stat.label}</p>
                <stat.icon size={15} className="text-fern" />
              </div>
              <p className={`display mt-2 text-[26px] leading-none ${stat.tone ?? ""}`}>{stat.value}</p>
            </Link>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/admin/users" className="card flex items-center gap-3 p-4 hover:border-ink/25">
            <UserCog size={17} className="text-fern" />
            <div>
              <p className="text-[12px] font-bold">{wholesaleCount} wholesale accounts</p>
              <p className="text-[10.5px] text-ink/50">
                {unverifiedCount} awaiting email confirmation · manage pricing & tax exemption
              </p>
            </div>
          </Link>
          <Link href="/admin/orders" className="card flex items-center gap-3 p-4 hover:border-ink/25">
            <Truck size={17} className="text-fern" />
            <div>
              <p className="text-[12px] font-bold">{openOrders} shipments in motion</p>
              <p className="text-[10.5px] text-ink/50">
                Enter tracking numbers and update fulfilment status
              </p>
            </div>
          </Link>
          <Link href="/quick-order" className="card flex items-center gap-3 p-4 hover:border-ink/25">
            <Boxes size={17} className="text-fern" />
            <div>
              <p className="text-[12px] font-bold">{lowStock.length} SKUs below reorder point</p>
              <p className="text-[10.5px] text-ink/50">Allocation at 10 cases or fewer</p>
            </div>
          </Link>
        </div>

        <div className="mt-6" id="applications">
          <AdminApplications
            applications={applicationRows.map((app) => ({
              id: app.id,
              companyName: app.companyName,
              ein: app.ein,
              businessType: app.businessType,
              contactName: app.contactName,
              email: app.email,
              phone: app.phone,
              website: app.website,
              addressLine1: app.addressLine1,
              city: app.city,
              state: app.state,
              zip: app.zip,
              annualVolume: app.annualVolume,
              categories: app.categories,
              notes: app.notes,
              status: app.status,
              rejectionReason: app.rejectionReason,
              discountPct: app.discountPct,
              taxExempt: app.taxExempt,
              verifiedEin: app.verifiedEin,
              createdAt: app.createdAt.toISOString(),
            }))}
          />
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-bold tracking-[0.14em] uppercase">Recent orders</p>
            <Link href="/admin/orders" className="text-[10.5px] font-bold text-fern hover:underline">
              Open full order tracking →
            </Link>
          </div>
          <AdminOrders
            orders={orderRows.slice(0, 12).map((order) => ({
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
            }))}
          />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="card p-4" id="inventory">
            <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.12em] uppercase">
              <Boxes size={13} /> Inventory watch
            </p>
            <p className="mt-1 text-[10.5px] text-ink/45">Allocation at 10 cases or fewer.</p>
            <ul className="mt-3 space-y-2">
              {lowStock.length === 0 ? (
                <li className="text-[11px] text-ink/50">All SKUs above the reorder point.</li>
              ) : (
                lowStock.map((item) => (
                  <li key={item.slug} className="flex items-center justify-between border-b border-ink/8 pb-1.5 text-[11px] last:border-0">
                    <Link href={`/products/${item.slug}`} className="font-medium hover:underline">{item.name}</Link>
                    <span className={`font-bold tabular-nums ${item.stock <= 5 ? "text-clay" : "text-ink/60"}`}>
                      {item.stock} cases
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="card p-4">
            <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.12em] uppercase">
              <ShieldCheck size={13} /> Integration status
            </p>
            <p className="mt-1 text-[10.5px] text-ink/45">
              Production keys upgrade the demo fallbacks automatically.
            </p>
            <ul className="mt-3 space-y-2">
              {integrations.map((item) => (
                <li key={item.label} className="flex items-center justify-between border-b border-ink/8 pb-1.5 text-[11px] last:border-0">
                  <div>
                    <p className="font-medium">{item.label}</p>
                    <p className="text-[9.5px] text-ink/40">{item.note}</p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                      item.ok ? "bg-fern/15 text-fern" : "bg-gold/20 text-[#7a5a1f]"
                    }`}
                  >
                    {item.ok ? "Live" : "Fallback"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 flex items-start gap-1.5 text-[10px] leading-relaxed text-ink/45">
              <Percent size={11} className="mt-0.5" /> Account discount and tax exemption are written to the
              user record on approval and re-applied server-side on every quote.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
