import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { coupons } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { requireStaff, staffDenied } from "@/lib/auth";
import { CouponInputError, validateCouponInput } from "@/lib/coupon-input";
import { pgConstraint } from "@/db/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Promotion codes (SEP-6). Promotions are a sales matter, so they sit behind the "accounts"
 * permission: owner and sales. Every change is written to the audit log.
 */
export async function GET() {
  const admin = await requireStaff("view");
  if (!admin) return staffDenied();
  const rows = await db.select().from(coupons).orderBy(asc(coupons.code));
  return Response.json({ ok: true, coupons: rows });
}

export async function POST(request: Request) {
  try {
    const admin = await requireStaff("accounts");
    if (!admin) return staffDenied();

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const input = validateCouponInput(body);

    const created = await db.transaction(async (tx) => {
      const [row] = await tx.insert(coupons).values(input).returning();
      await recordAudit(tx, {
        actor: admin,
        action: "coupon.create",
        entityType: "coupon",
        entityId: row.id,
        after: { ...input, startsAt: input.startsAt?.toISOString() ?? null, expiresAt: input.expiresAt?.toISOString() ?? null },
        request,
      });
      return row;
    });
    return Response.json({ ok: true, coupon: created, message: `Coupon ${created.code} created.` });
  } catch (error) {
    if (error instanceof CouponInputError) return Response.json({ error: error.message }, { status: 400 });
    if (pgConstraint(error) === "coupons_code_unique") {
      return Response.json({ error: "That code already exists." }, { status: 409 });
    }
    console.error("[admin-coupon-create]", error);
    return Response.json({ error: "Could not save the coupon." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireStaff("accounts");
    if (!admin) return staffDenied();

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const id = Number(body.id);
    if (!Number.isInteger(id) || id < 1) return Response.json({ error: "Unknown coupon." }, { status: 400 });

    const [existing] = await db.select().from(coupons).where(eq(coupons.id, id)).limit(1);
    if (!existing) return Response.json({ error: "Coupon not found." }, { status: 404 });

    // A pause only flips `active`; everything else goes through the same validation as a create.
    if (Object.keys(body).length === 2 && "active" in body) {
      const active = Boolean(body.active);
      await db.transaction(async (tx) => {
        await tx.update(coupons).set({ active }).where(eq(coupons.id, id));
        await recordAudit(tx, {
          actor: admin,
          action: active ? "coupon.resume" : "coupon.pause",
          entityType: "coupon",
          entityId: id,
          before: { active: existing.active },
          after: { active },
          request,
        });
      });
      return Response.json({ ok: true, message: `${existing.code} ${active ? "resumed" : "paused"}.` });
    }

    const input = validateCouponInput({ ...body, code: body.code ?? existing.code });
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx.update(coupons).set(input).where(eq(coupons.id, id)).returning();
      await recordAudit(tx, {
        actor: admin,
        action: "coupon.update",
        entityType: "coupon",
        entityId: id,
        before: { ...existing, startsAt: existing.startsAt?.toISOString() ?? null, expiresAt: existing.expiresAt?.toISOString() ?? null, createdAt: undefined },
        after: { ...input, startsAt: input.startsAt?.toISOString() ?? null, expiresAt: input.expiresAt?.toISOString() ?? null },
        request,
      });
      return row;
    });
    return Response.json({ ok: true, coupon: updated, message: `Coupon ${updated.code} saved.` });
  } catch (error) {
    if (error instanceof CouponInputError) return Response.json({ error: error.message }, { status: 400 });
    if (pgConstraint(error) === "coupons_code_unique") {
      return Response.json({ error: "That code already exists." }, { status: 409 });
    }
    console.error("[admin-coupon-update]", error);
    return Response.json({ error: "Could not save the coupon." }, { status: 500 });
  }
}
