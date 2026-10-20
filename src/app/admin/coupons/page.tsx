import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { couponRedemptions, coupons } from "@/db/schema";
import { requireStaffPage } from "@/lib/auth";
import { hasPermission } from "@/lib/staff";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminCoupons, type AdminCoupon } from "@/components/admin/AdminCoupons";

export const metadata = {
  title: "Admin · coupons",
  robots: { index: false, follow: false },
};

export default async function CouponsPage() {
  const staff = await requireStaffPage("view", "/admin/coupons");
  const rows = await db
    .select({
      coupon: coupons,
      redeemed: sql<number>`count(${couponRedemptions.id})::int`,
      discounted: sql<number>`coalesce(sum(${couponRedemptions.amount}), 0)::int`,
    })
    .from(coupons)
    .leftJoin(couponRedemptions, eq(couponRedemptions.couponId, coupons.id))
    .groupBy(coupons.id)
    .orderBy(asc(coupons.code));

  const list: AdminCoupon[] = rows.map(({ coupon, redeemed, discounted }) => ({
    id: coupon.id,
    code: coupon.code,
    kind: coupon.kind,
    value: coupon.value,
    minSubtotal: coupon.minSubtotal,
    description: coupon.description,
    active: coupon.active,
    startsAt: coupon.startsAt?.toISOString() ?? null,
    expiresAt: coupon.expiresAt?.toISOString() ?? null,
    maxRedemptions: coupon.maxRedemptions,
    perCustomerLimit: coupon.perCustomerLimit,
    allowedTiers: coupon.allowedTiers,
    stackable: coupon.stackable,
    redeemed,
    discounted,
  }));

  return (
    <div>
      <section className="bg-ink text-cream">
        <div className="wrap py-8">
          <Link href="/admin" className="inline-flex items-center gap-1.5 text-[10.5px] font-bold text-cream/50 hover:text-cream">
            <ArrowLeft size={12} /> Admin console
          </Link>
          <h1 className="display mt-2 text-[30px] leading-tight text-cream sm:text-[36px]">Coupons</h1>
          <p className="mt-1.5 max-w-2xl text-[11.5px] text-cream/55">
            Promotion codes with a redemption window, usage limits and tier rules. A freight code waives ground
            service only, and a code marked single-use cannot be stacked on contract pricing.
          </p>
        </div>
        <AdminNav />
      </section>
      <div className="wrap py-8">
        <AdminCoupons coupons={list} canEdit={hasPermission(staff, "accounts")} />
      </div>
    </div>
  );
}
