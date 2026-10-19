import { and, asc, eq, gt, gte, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { inventoryMovements, productLots, products, type ProductLot } from "@/db/schema";

/**
 * Warehouse stock, by lot.
 *
 * - Every case lives in a lot (`product_lots`): lot number, best-by date, quantity on hand
 *   and quantity in quarantine. Goods without a best-by date use lots with `expires_on` null.
 * - `products.stock` is the sellable total: on-hand cases in lots whose status is
 *   "available". It is only ever changed by a delta, in the same transaction as the lot
 *   change, so concurrent orders and receipts cannot overwrite each other (STK-1).
 * - Every lot change writes one `inventory_movements` row (STK-2).
 * - Orders take stock first-expired-first-out (FEFO) and record the lots they took (STK-3).
 */

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Lots this close to their best-by date are no longer sold (retail buyers need shelf life). */
export const EXPIRY_PULL_DAYS = 60;
/** The admin console warns about lots this close to their best-by date. */
export const EXPIRY_WARN_DAYS = 120;

export const LOT_STATUSES = ["available", "hold", "expired", "recalled"] as const;
export type LotStatus = (typeof LOT_STATUSES)[number];

export const ADJUST_REASONS = ["count", "damage", "writeoff", "found", "adjust"] as const;

export class InventoryError extends Error {}

/** Thrown inside the order transaction when a line can no longer be reserved. */
export class StockShortError extends Error {
  constructor(public readonly productName: string) {
    super(`${productName} no longer has enough stock.`);
  }
}

type Actor = { actorId?: number | null };

async function moveSellable(tx: Tx, productId: number, delta: number): Promise<void> {
  if (delta === 0) return;
  if (delta > 0) {
    await tx.update(products).set({ stock: sql`${products.stock} + ${delta}` }).where(eq(products.id, productId));
    return;
  }
  const done = await tx
    .update(products)
    .set({ stock: sql`${products.stock} + ${delta}` })
    .where(and(eq(products.id, productId), gte(products.stock, -delta)))
    .returning({ id: products.id });
  if (!done.length) throw new InventoryError("Sellable stock would go below zero.");
}

async function logMovement(
  tx: Tx,
  entry: {
    productId: number;
    lotId: number | null;
    bucket?: "on_hand" | "quarantine";
    delta: number;
    reason: string;
    refType?: string | null;
    refId?: string | number | null;
    note?: string | null;
  } & Actor,
) {
  await tx.insert(inventoryMovements).values({
    productId: entry.productId,
    lotId: entry.lotId,
    bucket: entry.bucket ?? "on_hand",
    delta: entry.delta,
    reason: entry.reason,
    refType: entry.refType ?? null,
    refId: entry.refId === undefined || entry.refId === null ? null : String(entry.refId),
    note: entry.note ?? null,
    actorId: entry.actorId ?? null,
  });
}

export function normaliseLotNumber(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")
    .slice(0, 40);
}

/** `YYYY-MM-DD` or null; throws on anything else. */
export function parseExpiry(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`))) {
    throw new InventoryError("Best-by date must be YYYY-MM-DD.");
  }
  return raw;
}

/**
 * Goods received into the warehouse. A repeat delivery of the same lot number adds to it;
 * the same lot number with a different best-by date is refused.
 */
export async function receiveLot(
  tx: Tx,
  input: {
    productId: number;
    lotNumber: string;
    expiresOn: string | null;
    cases: number;
    supplier?: string | null;
    note?: string | null;
    reason?: "receipt" | "opening" | "import";
    refType?: string | null;
    refId?: string | number | null;
  } & Actor,
): Promise<ProductLot> {
  const lotNumber = normaliseLotNumber(input.lotNumber);
  if (!/^[A-Z0-9][A-Z0-9\-_./]{0,39}$/.test(lotNumber)) {
    throw new InventoryError("Lot number: letters, digits, dashes, dots or slashes (max 40).");
  }
  if (!Number.isInteger(input.cases) || input.cases < 1 || input.cases > 1_000_000) {
    throw new InventoryError("Received quantity must be a whole number of cases (1 or more).");
  }

  const [existing] = await tx
    .select()
    .from(productLots)
    .where(and(eq(productLots.productId, input.productId), eq(productLots.lotNumber, lotNumber)))
    .for("update")
    .limit(1);

  let lot: ProductLot;
  if (existing) {
    if ((existing.expiresOn ?? null) !== (input.expiresOn ?? null)) {
      throw new InventoryError(
        `Lot ${lotNumber} is already on file with best-by ${existing.expiresOn ?? "none"}. Use a different lot number.`,
      );
    }
    const [row] = await tx
      .update(productLots)
      .set({
        qtyReceived: sql`${productLots.qtyReceived} + ${input.cases}`,
        qtyOnHand: sql`${productLots.qtyOnHand} + ${input.cases}`,
      })
      .where(eq(productLots.id, existing.id))
      .returning();
    lot = row;
  } else {
    const [row] = await tx
      .insert(productLots)
      .values({
        productId: input.productId,
        lotNumber,
        expiresOn: input.expiresOn,
        supplier: input.supplier?.trim().slice(0, 120) || null,
        qtyReceived: input.cases,
        qtyOnHand: input.cases,
        note: input.note?.trim().slice(0, 500) || null,
      })
      .returning();
    lot = row;
  }

  if (lot.status === "available") await moveSellable(tx, input.productId, input.cases);
  await logMovement(tx, {
    productId: input.productId,
    lotId: lot.id,
    delta: input.cases,
    reason: input.reason ?? "receipt",
    refType: input.refType,
    refId: input.refId,
    note: input.note,
    actorId: input.actorId,
  });
  return lot;
}

/** A counted correction, damage or write-off on one lot. `delta` is signed. */
export async function adjustLot(
  tx: Tx,
  input: {
    lotId: number;
    delta: number;
    bucket?: "on_hand" | "quarantine";
    reason: string;
    note?: string | null;
    refType?: string | null;
    refId?: string | number | null;
  } & Actor,
): Promise<ProductLot> {
  if (!Number.isInteger(input.delta) || input.delta === 0) throw new InventoryError("Adjustment must be a non-zero whole number.");
  const bucket = input.bucket ?? "on_hand";
  const column = bucket === "on_hand" ? productLots.qtyOnHand : productLots.qtyQuarantine;
  const [lot] = await tx
    .update(productLots)
    .set(bucket === "on_hand" ? { qtyOnHand: sql`${column} + ${input.delta}` } : { qtyQuarantine: sql`${column} + ${input.delta}` })
    .where(and(eq(productLots.id, input.lotId), gte(column, Math.max(0, -input.delta))))
    .returning();
  if (!lot) throw new InventoryError("Not enough cases in that lot for this adjustment.");
  if (bucket === "on_hand" && lot.status === "available") await moveSellable(tx, lot.productId, input.delta);
  await logMovement(tx, { ...input, productId: lot.productId, lotId: lot.id, bucket });
  return lot;
}

/** Hold, release, recall or expire a lot. Only "available" lots count as sellable stock. */
export async function setLotStatus(
  tx: Tx,
  input: { lotId: number; status: LotStatus; note?: string | null } & Actor,
): Promise<ProductLot> {
  const [lot] = await tx.select().from(productLots).where(eq(productLots.id, input.lotId)).for("update").limit(1);
  if (!lot) throw new InventoryError("Lot not found.");
  if (lot.status === input.status) return lot;
  if (lot.status === "recalled") throw new InventoryError("A recalled lot cannot be released.");

  const wasSellable = lot.status === "available";
  const nowSellable = input.status === "available";
  if (nowSellable && lot.expiresOn && lot.expiresOn <= isoDate(addDays(new Date(), EXPIRY_PULL_DAYS))) {
    throw new InventoryError(`Lot ${lot.lotNumber} is within ${EXPIRY_PULL_DAYS} days of its best-by date and cannot be sold.`);
  }
  const [row] = await tx.update(productLots).set({ status: input.status }).where(eq(productLots.id, lot.id)).returning();
  if (wasSellable !== nowSellable) await moveSellable(tx, lot.productId, nowSellable ? lot.qtyOnHand : -lot.qtyOnHand);
  await logMovement(tx, {
    productId: lot.productId,
    lotId: lot.id,
    delta: 0,
    reason: input.status === "available" ? "release" : input.status === "expired" ? "expire" : input.status,
    note: `${lot.status} → ${input.status} (${lot.qtyOnHand} cases on hand)${input.note ? ` · ${input.note}` : ""}`,
    actorId: input.actorId,
  });
  return row;
}

/**
 * Records the best-by date of a lot that has none (opening balances from the Faz 1 migration).
 * A date that is already on file is never changed — receive a new lot instead.
 */
export async function setLotExpiry(tx: Tx, input: { lotId: number; expiresOn: string } & Actor): Promise<ProductLot> {
  const [lot] = await tx
    .update(productLots)
    .set({ expiresOn: input.expiresOn })
    .where(and(eq(productLots.id, input.lotId), isNull(productLots.expiresOn)))
    .returning();
  if (!lot) throw new InventoryError("This lot already has a best-by date; it cannot be changed.");
  await logMovement(tx, {
    productId: lot.productId,
    lotId: lot.id,
    delta: 0,
    reason: "adjust",
    note: `Best-by recorded: ${input.expiresOn}`,
    actorId: input.actorId,
  });
  return lot;
}

export type Allocation = { lotId: number; lotNumber: string; expiresOn: string | null; cases: number };

/**
 * Takes `cases` from the product's sellable lots, earliest best-by first. Locks the product
 * row so two orders for the same product allocate one after the other.
 */
export async function allocateFefo(
  tx: Tx,
  input: { productId: number; productName: string; cases: number; orderId: number },
): Promise<Allocation[]> {
  const [product] = await tx
    .select({ stock: products.stock })
    .from(products)
    .where(eq(products.id, input.productId))
    .for("update")
    .limit(1);
  if (!product || product.stock < input.cases) throw new StockShortError(input.productName);

  const cutoff = isoDate(addDays(new Date(), EXPIRY_PULL_DAYS));
  const lots = await tx
    .select()
    .from(productLots)
    .where(
      and(
        eq(productLots.productId, input.productId),
        eq(productLots.status, "available"),
        gt(productLots.qtyOnHand, 0),
        or(isNull(productLots.expiresOn), gt(productLots.expiresOn, cutoff)),
      ),
    )
    .orderBy(sql`${productLots.expiresOn} asc nulls last`, asc(productLots.receivedAt), asc(productLots.id))
    .for("update");

  const allocations: Allocation[] = [];
  let remaining = input.cases;
  for (const lot of lots) {
    if (remaining === 0) break;
    const take = Math.min(lot.qtyOnHand, remaining);
    allocations.push({ lotId: lot.id, lotNumber: lot.lotNumber, expiresOn: lot.expiresOn, cases: take });
    remaining -= take;
  }
  if (remaining > 0) throw new StockShortError(input.productName);

  for (const allocation of allocations) {
    await tx
      .update(productLots)
      .set({ qtyOnHand: sql`${productLots.qtyOnHand} - ${allocation.cases}` })
      .where(eq(productLots.id, allocation.lotId));
    await logMovement(tx, {
      productId: input.productId,
      lotId: allocation.lotId,
      delta: -allocation.cases,
      reason: "order",
      refType: "order",
      refId: input.orderId,
    });
  }
  await moveSellable(tx, input.productId, -input.cases);
  return allocations;
}

/**
 * Puts cases back into the lots they came from — sellable ("on_hand") for a cancellation or
 * a sealed return, "quarantine" for opened returns. If the lot record is gone, a new lot with
 * the same number is opened.
 */
export async function returnToLot(
  tx: Tx,
  input: {
    productId: number;
    lotId: number | null;
    lotNumber: string;
    expiresOn: string | null;
    cases: number;
    bucket: "on_hand" | "quarantine";
    reason: "cancel" | "return";
    refType: string;
    refId: string | number;
    note?: string | null;
  } & Actor,
): Promise<void> {
  if (input.cases <= 0) return;
  let lotId = input.lotId;
  if (lotId === null) {
    const [found] = await tx
      .select({ id: productLots.id })
      .from(productLots)
      .where(and(eq(productLots.productId, input.productId), eq(productLots.lotNumber, input.lotNumber)))
      .limit(1);
    lotId =
      found?.id ??
      (
        await tx
          .insert(productLots)
          .values({ productId: input.productId, lotNumber: input.lotNumber, expiresOn: input.expiresOn, qtyReceived: 0 })
          .returning({ id: productLots.id })
      )[0].id;
  }
  const [lot] = await tx
    .update(productLots)
    .set(
      input.bucket === "on_hand"
        ? { qtyOnHand: sql`${productLots.qtyOnHand} + ${input.cases}` }
        : { qtyQuarantine: sql`${productLots.qtyQuarantine} + ${input.cases}` },
    )
    .where(eq(productLots.id, lotId))
    .returning();
  if (input.bucket === "on_hand" && lot.status === "available") await moveSellable(tx, input.productId, input.cases);
  await logMovement(tx, { ...input, lotId, delta: input.cases });
}

/** Daily: lots inside the pull window stop being sold. */
export async function pullExpiringLots(): Promise<string[]> {
  const cutoff = isoDate(addDays(new Date(), EXPIRY_PULL_DAYS));
  const due = await db
    .select({ id: productLots.id, lotNumber: productLots.lotNumber })
    .from(productLots)
    .where(and(eq(productLots.status, "available"), sql`${productLots.expiresOn} <= ${cutoff}`))
    .limit(500);
  const pulled: string[] = [];
  for (const lot of due) {
    await db.transaction((tx) =>
      setLotStatus(tx, { lotId: lot.id, status: "expired", note: `Within ${EXPIRY_PULL_DAYS} days of best-by` }),
    );
    pulled.push(lot.lotNumber);
  }
  return pulled;
}

/** Products whose stock column disagrees with their lots (should always be empty). */
export async function stockDrift(): Promise<{ productId: number; stock: number; lots: number }[]> {
  const rows = await db.execute<{ product_id: number; stock: number; lots: number }>(sql`
    select p.id as product_id, p.stock, coalesce(sum(l.qty_on_hand) filter (where l.status = 'available'), 0)::int as lots
    from products p left join product_lots l on l.product_id = p.id
    group by p.id, p.stock
    having p.stock <> coalesce(sum(l.qty_on_hand) filter (where l.status = 'available'), 0)
  `);
  return rows.rows.map((row) => ({ productId: Number(row.product_id), stock: Number(row.stock), lots: Number(row.lots) }));
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
