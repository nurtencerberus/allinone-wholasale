import { eq } from "drizzle-orm";
import { db } from "@/db";
import { productLots, products } from "@/db/schema";
import { requireStaff, staffDenied } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import {
  ADJUST_REASONS,
  adjustLot,
  InventoryError,
  LOT_STATUSES,
  parseExpiry,
  receiveLot,
  setLotExpiry,
  setLotStatus,
  type LotStatus,
} from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  action?: "receive" | "adjust" | "status" | "expiry";
  productId?: number;
  lotId?: number;
  lotNumber?: string;
  expiresOn?: string;
  cases?: number;
  delta?: number;
  bucket?: "on_hand" | "quarantine";
  reason?: string;
  status?: string;
  supplier?: string;
  note?: string;
};

/** Every stock change goes through here as a signed delta on one lot, with a reason. */
export async function POST(request: Request) {
  try {
    const admin = await requireStaff("inventory");
    if (!admin) return staffDenied();
    const body = (await request.json().catch(() => ({}))) as Body;
    const note = String(body.note ?? "").trim().slice(0, 500) || null;
    const actor = { id: admin.id, email: admin.email };

    if (body.action === "receive") {
      const productId = Number(body.productId);
      const [product] = await db.select({ id: products.id, shelfLifeDays: products.shelfLifeDays, taxClass: products.taxClass }).from(products).where(eq(products.id, productId)).limit(1);
      if (!product) return Response.json({ error: "Product not found." }, { status: 404 });
      const expiresOn = parseExpiry(body.expiresOn);
      if (!expiresOn && (product.taxClass !== "general" || product.shelfLifeDays)) {
        return Response.json({ error: "Food and supplement lots need a best-by date." }, { status: 400 });
      }
      const lot = await db.transaction(async (tx) => {
        const row = await receiveLot(tx, {
          productId,
          lotNumber: String(body.lotNumber ?? ""),
          expiresOn,
          cases: Number(body.cases),
          supplier: body.supplier ?? null,
          note,
          actorId: admin.id,
        });
        await recordAudit(tx, {
          actor,
          action: "inventory.receive",
          entityType: "inventory",
          entityId: row.id,
          after: { productId, lot: row.lotNumber, expiresOn, cases: Number(body.cases) },
          request,
        });
        return row;
      });
      // Cases on a lot that is not "available" are on file but not for sale — say so, or the
      // receipt reads like stock the storefront will never show.
      const sellable = lot.status === "available";
      return Response.json({
        ok: true,
        lot,
        message: sellable
          ? `Received ${Number(body.cases)} cases into lot ${lot.lotNumber}.`
          : `Received ${Number(body.cases)} cases into lot ${lot.lotNumber}, which is ${lot.status} — these cases are not for sale.`,
      });
    }

    if (body.action === "adjust") {
      const reason = String(body.reason ?? "");
      if (!(ADJUST_REASONS as readonly string[]).includes(reason)) {
        return Response.json({ error: `Reason must be one of: ${ADJUST_REASONS.join(", ")}.` }, { status: 400 });
      }
      if (!note) return Response.json({ error: "Explain the adjustment in the note." }, { status: 400 });
      const delta = Math.round(Number(body.delta));
      const bucket = body.bucket === "quarantine" ? "quarantine" : "on_hand";
      const lot = await db.transaction(async (tx) => {
        const row = await adjustLot(tx, { lotId: Number(body.lotId), delta, bucket, reason, note, actorId: admin.id });
        await recordAudit(tx, {
          actor,
          action: "inventory.adjust",
          entityType: "inventory",
          entityId: row.id,
          after: { lot: row.lotNumber, bucket, delta, reason, note },
          request,
        });
        return row;
      });
      return Response.json({ ok: true, lot, message: `Lot ${lot.lotNumber} adjusted by ${delta > 0 ? "+" : ""}${delta}.` });
    }

    if (body.action === "status") {
      const status = String(body.status ?? "");
      if (!(LOT_STATUSES as readonly string[]).includes(status)) {
        return Response.json({ error: `Status must be one of: ${LOT_STATUSES.join(", ")}.` }, { status: 400 });
      }
      const lotId = Number(body.lotId);
      const [before] = await db.select({ status: productLots.status }).from(productLots).where(eq(productLots.id, lotId)).limit(1);
      if (!before) return Response.json({ error: "Lot not found." }, { status: 404 });
      const lot = await db.transaction(async (tx) => {
        const row = await setLotStatus(tx, { lotId, status: status as LotStatus, note, actorId: admin.id });
        await recordAudit(tx, {
          actor,
          action: `inventory.${status === "available" ? "release" : status}`,
          entityType: "inventory",
          entityId: row.id,
          before: { status: before.status },
          after: { status, lot: row.lotNumber, note },
          request,
        });
        return row;
      });
      return Response.json({ ok: true, lot, message: `Lot ${lot.lotNumber} is now ${lot.status}.` });
    }

    if (body.action === "expiry") {
      const expiresOn = parseExpiry(body.expiresOn);
      if (!expiresOn) return Response.json({ error: "Enter the best-by date." }, { status: 400 });
      const lot = await db.transaction(async (tx) => {
        const row = await setLotExpiry(tx, { lotId: Number(body.lotId), expiresOn, actorId: admin.id });
        await recordAudit(tx, { actor, action: "inventory.expiry", entityType: "inventory", entityId: row.id, after: { lot: row.lotNumber, expiresOn }, request });
        return row;
      });
      return Response.json({ ok: true, lot, message: `Lot ${lot.lotNumber} best-by set to ${expiresOn}.` });
    }

    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    if (error instanceof InventoryError) return Response.json({ error: error.message }, { status: 400 });
    console.error("[admin-inventory]", error);
    return Response.json({ error: "Inventory update failed." }, { status: 500 });
  }
}
