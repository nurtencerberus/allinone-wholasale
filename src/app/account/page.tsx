import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { ArrowRight, BadgeCheck, Boxes, Building2, ClipboardList, FileText, MapPin, Package, Percent, Plus, ShieldCheck, Truck } from "lucide-react";
import { db } from "@/db";
import { addresses, orders, wholesaleApplications } from "@/db/schema";
import { ApplicationDocuments } from "@/components/account/ApplicationDocuments";
import { documentsFor } from "@/lib/application-docs";
import { canSeePrices, getSessionUser } from "@/lib/auth";
import { isStaffRole } from "@/lib/staff";
import { AccountActions } from "@/components/account/AccountActions";
import { formatDate, formatMoney, formatRate } from "@/lib/money";

export const metadata = {
  title: "Your trade account",
  robots: { index: false, follow: false },
};

const STATUS_STYLE: Record<string, string> = {
  processing: "bg-gold/15 text-[#7a5a1f]",
  picking: "bg-sky-100 text-sky-800",
  shipped: "bg-fern/15 text-fern",
  delivered: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-clay/15 text-clay",
};

export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account");

  // Guest orders are matched by e-mail only once the account has proved it owns that address;
  // a member of a company account also sees what colleagues ordered for it (UX-7).
  const mine = user.emailVerified
    ? or(eq(orders.userId, user.id), eq(orders.email, user.email))!
    : eq(orders.userId, user.id);
  const ownOrders = user.companyId ? or(mine, eq(orders.companyId, user.companyId)) : mine;

  const [orderRows, addressRows, applicationRows] = await Promise.all([
    db
      .select()
      .from(orders)
      .where(ownOrders)
      .orderBy(desc(orders.createdAt))
      .limit(12),
    db.select().from(addresses).where(eq(addresses.userId, user.id)),
    db
      .select()
      .from(wholesaleApplications)
      .where(eq(wholesaleApplications.userId, user.id))
      .orderBy(desc(wholesaleApplications.createdAt))
      .limit(1),
  ]);

  const application = applicationRows[0];
  // KYT-11: the paperwork on this application, so the applicant can see and complete it.
  const applicationDocs = application ? await documentsFor(application.id) : [];
  const totalSpend = orderRows.reduce((sum, order) => sum + order.total, 0);
  const openShipments = orderRows.filter((order) => ["processing", "picking", "shipped"].includes(order.status));
  const [{ count: itemCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(ownOrders);

  return (
    <div className="wrap py-8 lg:py-10">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink/10 pb-6">
        <div>
          <p className="eyebrow">Trade portal</p>
          <h1 className="display mt-1.5 text-[32px] leading-tight sm:text-[38px]">
            Welcome back, {user.name.split(" ")[0]}.
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-ink/70">
            {user.email}
            {user.emailVerified ? (
              <span className="chip border-fern/25 bg-fern/8 text-fern">
                <BadgeCheck size={10} /> Email confirmed
              </span>
            ) : (
              <span className="chip border-gold/40 bg-gold/10 text-[#7a5a1f]">Confirmation pending</span>
            )}
            {user.accountTier === "wholesale" ? (
              <span className="chip border-clay/30 bg-clay/10 text-clay">
                <Percent size={10} /> Trade · {user.wholesaleDiscountPct}%
              </span>
            ) : (
              <span className="chip">Catalog pricing</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/quick-order" className="btn btn-primary btn-sm">
            <Plus size={13} /> Quick order
          </Link>
          <Link href="/shop" className="btn btn-outline btn-sm">Order again</Link>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Orders placed", value: `${itemCount}`, icon: ClipboardList },
          { label: "Lifetime value", value: formatMoney(totalSpend, { decimals: false }), icon: Boxes },
          { label: "Open shipments", value: `${openShipments.length}`, icon: Truck },
          {
            label: user.taxExempt ? "Tax status" : "Destination tax",
            value: user.taxExempt ? "Resale exempt" : "Calculated by ZIP",
            icon: ShieldCheck,
          },
        ].map((stat) => (
          <div key={stat.label} className="card p-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold tracking-[0.12em] text-ink/65 uppercase">{stat.label}</p>
              <stat.icon size={15} className="text-fern" />
            </div>
            <p className="display mt-2 text-[24px] leading-none">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
        <div>
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-ink/10 bg-parchment/50 px-4 py-3">
              <p className="text-[11px] font-bold tracking-[0.14em] uppercase">Order history</p>
              <span className="text-[10.5px] text-ink/65">{orderRows.length} most recent</span>
            </div>
            {orderRows.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
                <Package size={26} className="text-ink/25" />
                <p className="text-[13px] font-bold">No orders yet</p>
                <p className="max-w-xs text-[11.5px] text-ink/70">
                  Build a mixed pallet across supplements, pantry and home goods.
                </p>
                <Link href="/shop" className="btn btn-primary btn-sm mt-2">Start an order</Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-[11.5px]">
                  <thead className="text-[9.5px] font-bold tracking-[0.12em] text-ink/65 uppercase">
                    <tr className="border-b border-ink/8">
                      <th scope="col" className="px-4 py-2.5">Order</th>
                      <th scope="col" className="px-2 py-2.5">Placed</th>
                      <th scope="col" className="px-2 py-2.5">Status</th>
                      <th scope="col" className="px-2 py-2.5">Freight</th>
                      <th scope="col" className="px-2 py-2.5 text-right">Total</th>
                      <th scope="col" className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {orderRows.map((order) => (
                      <tr key={order.id} className="border-b border-ink/5 last:border-0 hover:bg-parchment/30">
                        <td className="px-4 py-3">
                          <p className="font-bold">{order.orderNumber}</p>
                          <p className="text-[10px] text-ink/65">
                            {order.taxExempt ? "Tax exempt" : formatRate(order.taxRate)}
                          </p>
                        </td>
                        <td className="px-2 py-3 text-ink/72">{formatDate(order.createdAt)}</td>
                        <td className="px-2 py-3">
                          <span
                            className={`rounded-full px-2 py-1 text-[9.5px] font-bold uppercase ${
                              STATUS_STYLE[order.status] ?? "bg-ink/10 text-ink/72"
                            }`}
                          >
                            {order.status}
                          </span>
                        </td>
                        <td className="px-2 py-3">
                          <p className="text-ink/70">{order.shippingCarrier}</p>
                          <p className="text-[9.5px] text-ink/65">{order.trackingNumber ?? "Tracking pending"}</p>
                        </td>
                        <td className="px-2 py-3 text-right font-bold tabular-nums">{formatMoney(order.total)}</td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/order/${order.orderNumber}`}
                            className="inline-flex items-center gap-1 text-[10.5px] font-bold text-fern hover:underline"
                          >
                            View <ArrowRight size={11} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-4 card p-4">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.12em] uppercase">
                <Building2 size={13} /> {user.company ? user.company : "Company account"}
              </p>
              <Link href="/account/team" className="text-[10.5px] font-bold text-fern hover:underline">
                {user.companyId ? "Manage team" : "Set up"}
              </Link>
            </div>
            <p className="mt-2 text-[11.5px] text-ink/68">
              {user.companyId
                ? "Colleagues on this account buy on the same terms and see the same orders, quotes and agreed prices."
                : "Let colleagues order on the same terms and see the same history."}
            </p>
          </div>

          {canSeePrices(user) ? (
            <div className="mt-4 card p-4">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.12em] uppercase">
                  <FileText size={13} /> Quotes
                </p>
                <Link href="/account/quotes" className="text-[10.5px] font-bold text-fern hover:underline">
                  Open
                </Link>
              </div>
              <p className="mt-2 text-[11.5px] text-ink/68">
                Ask the trade desk to price the quantities you actually buy. Accepted prices apply to your orders
                until the quote expires.
              </p>
            </div>
          ) : null}

          <div className="mt-4 card p-4">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.12em] uppercase">
                <MapPin size={13} /> Saved addresses
              </p>
              <Link href="/account/addresses" className="text-[10.5px] font-bold text-fern hover:underline">
                Manage
              </Link>
            </div>
            {addressRows.length === 0 ? (
              <p className="mt-2 text-[11.5px] text-ink/68">
                Add a dock address to speed up freight quotes and LTL scheduling.
              </p>
            ) : (
              <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                {addressRows.map((entry) => (
                  <div key={entry.id} className="rounded-md border border-ink/10 bg-parchment/30 px-3 py-2.5">
                    <p className="text-[11px] font-bold">
                      {entry.label}
                      {entry.isDefault ? <span className="ml-1.5 text-[9px] font-semibold text-fern">DEFAULT</span> : null}
                    </p>
                    <p className="text-[10.5px] leading-relaxed text-ink/70">
                      {entry.line1}
                      {entry.line2 ? `, ${entry.line2}` : ""}
                      <br />
                      {entry.city}, {entry.state} {entry.zip}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="card p-4">
            <p className="eyebrow">Account</p>
            <dl className="mt-2.5 space-y-2 text-[11.5px]">
              {[
                ["Contact", user.name],
                ["Company", user.company || "—"],
                ["Tier", user.accountTier === "wholesale" ? "Wholesale (approved)" : "Catalog"],
                ["Contract discount", user.wholesaleDiscountPct ? `${user.wholesaleDiscountPct}%` : "—"],
                ["Resale exemption", user.taxExempt ? `Yes · ${user.taxExemptState ?? "on file"}` : "Not on file"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3 border-b border-ink/8 pb-1.5 last:border-0">
                  <dt className="text-ink/65">{label}</dt>
                  <dd className="text-right font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-3">
              <AccountActions emailVerified={user.emailVerified} />
            </div>
          </div>

          <div className={`rounded-xl p-4 ${application?.status === "approved" ? "bg-moss text-cream" : "bg-ink text-cream"}`}>
            <p className="text-[10px] font-bold tracking-[0.16em] text-gold uppercase">Wholesale status</p>
            {application ? (
              <>
                <p className="mt-1.5 text-[13px] font-bold capitalize">{application.status}</p>
                <p className="mt-1 text-[10.5px] leading-relaxed text-cream/60">
                  {application.companyName} · EIN {application.ein}
                  {application.status === "approved"
                    ? ` · ${application.discountPct}% pricing${application.taxExempt ? ", resale exempt" : ""}`
                    : application.status === "rejected"
                      ? ` · ${application.rejectionReason}`
                      : " · under review by the trade desk"}
                </p>
              </>
            ) : (
              <>
                <p className="mt-1.5 text-[13px] font-bold">No application yet</p>
                <p className="mt-1 text-[10.5px] leading-relaxed text-cream/60">
                  Verify your EIN to unlock contract pricing, resale exemption and net 30.
                </p>
                <Link href="/wholesale/apply" className="btn btn-light btn-sm mt-3 w-full">
                  Apply now
                </Link>
              </>
            )}
          </div>

          {application ? (
            <ApplicationDocuments documents={applicationDocs} canEdit={application.status !== "rejected"} />
          ) : null}

          <div className="card p-4">
            <p className="eyebrow">Buyer tools</p>
            <div className="mt-2.5 space-y-1.5">
              {[
                { href: "/quick-order", label: "Quick order by SKU" },
                { href: "/api/order-sheet/download?format=xlsx", label: "Download XLS order sheet" },
                { href: "/account/addresses", label: "Saved addresses" },
                { href: "/account/security", label: user.twoFactorEnabled ? "Sign-in security · 2FA on" : "Sign-in security" },
                { href: "/shop?sort=rating", label: "Reorder best sellers" },
                { href: "/wholesale#freight", label: "Freight & dim weight guide" },
                { href: isStaffRole(user.role) ? "/admin" : "/wholesale", label: isStaffRole(user.role) ? "Admin portal" : "Trade program" },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center justify-between rounded-md px-2 py-2 text-[11.5px] font-medium text-ink/70 hover:bg-parchment/60 hover:text-ink"
                >
                  {link.label}
                  <ArrowRight size={12} className="text-ink/30" />
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
