import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders, users } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";

/**
 * ODE-6: credit control for invoice (Net-30) orders.
 *
 * Until now any approved trade account could place unlimited orders on terms, with nothing
 * tracking what it already owed. An account now has a credit limit, payment terms and a hold
 * flag, and a new invoice order is refused when it would take the balance past the limit, when
 * something is already overdue, or when the desk has put the account on hold.
 *
 * The balance is counted from the orders themselves — every order still on invoice and not
 * cancelled — so there is no second ledger to drift out of step.
 */

/** Order payment states that mean "we are waiting to be paid on terms". */
export const OPEN_INVOICE_STATES = ["net30_invoice", "partially_refunded"] as const;

export type CreditTerms = {
  creditLimit: number;
  paymentTermsDays: number;
  creditHold: boolean;
};

export type CreditPosition = CreditTerms & {
  /** Everything invoiced and not yet settled, in cents. */
  openBalance: number;
  /** Of that, what is already past its due date. */
  overdue: number;
  /** The oldest invoice still open, for the message the buyer sees. */
  oldestDueAt: Date | null;
  available: number;
};

/** The accounts whose invoices count towards one balance: the company, or just this buyer. */
async function accountIds(user: Pick<SessionUser, "id" | "companyId">): Promise<number[]> {
  if (!user.companyId) return [user.id];
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.companyId, user.companyId));
  const ids = rows.map((row) => row.id);
  return ids.includes(user.id) ? ids : [...ids, user.id];
}

export async function creditPosition(
  user: Pick<SessionUser, "id" | "companyId"> & Partial<CreditTerms>,
): Promise<CreditPosition> {
  const ids = await accountIds(user);
  const now = new Date();

  const rows = await db
    .select({ total: orders.total, refunded: orders.refundedAmount, dueAt: orders.dueAt })
    .from(orders)
    .where(
      and(
        inArray(orders.userId, ids),
        inArray(orders.paymentStatus, [...OPEN_INVOICE_STATES]),
        sql`${orders.status} <> 'cancelled'`,
      ),
    );

  let openBalance = 0;
  let overdue = 0;
  let oldestDueAt: Date | null = null;
  for (const row of rows) {
    const outstanding = Math.max(0, row.total - row.refunded);
    openBalance += outstanding;
    if (row.dueAt && row.dueAt <= now) {
      overdue += outstanding;
      if (!oldestDueAt || row.dueAt < oldestDueAt) oldestDueAt = row.dueAt;
    }
  }

  const creditLimit = user.creditLimit ?? 0;
  return {
    creditLimit,
    paymentTermsDays: user.paymentTermsDays ?? 30,
    creditHold: user.creditHold ?? false,
    openBalance,
    overdue,
    oldestDueAt,
    available: Math.max(0, creditLimit - openBalance),
  };
}

export type CreditDecision = { ok: true; position: CreditPosition } | { ok: false; reason: string; position: CreditPosition };

/**
 * Pure rule, so the message the buyer sees and the test that proves it share one definition.
 * Order: hold, then overdue, then the limit itself — the buyer should hear the real blocker.
 */
export function creditVerdict(position: CreditPosition, orderTotal: number): { ok: boolean; reason?: string } {
  if (position.creditHold) {
    return { ok: false, reason: "This account is on credit hold. The trade desk can release it." };
  }
  if (position.creditLimit <= 0) {
    return { ok: false, reason: "This account has no invoice credit yet. Ask the trade desk to set a limit." };
  }
  if (position.overdue > 0) {
    return {
      ok: false,
      reason: `There is ${money(position.overdue)} past due on the account. Settle it to order on terms again.`,
    };
  }
  if (position.openBalance + orderTotal > position.creditLimit) {
    return {
      ok: false,
      reason: `This order would take the account to ${money(position.openBalance + orderTotal)} against a ${money(
        position.creditLimit,
      )} credit limit. ${money(position.available)} is available, or pay by card or ACH.`,
    };
  }
  return { ok: true };
}

export async function checkCredit(
  user: Pick<SessionUser, "id" | "companyId"> & Partial<CreditTerms>,
  orderTotal: number,
): Promise<CreditDecision> {
  const position = await creditPosition(user);
  const verdict = creditVerdict(position, orderTotal);
  return verdict.ok ? { ok: true, position } : { ok: false, reason: verdict.reason!, position };
}

/** When an invoice placed now falls due. */
export function dueDateFor(termsDays: number, from = new Date()): Date {
  const days = Number.isInteger(termsDays) && termsDays > 0 ? Math.min(termsDays, 180) : 30;
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export type AgingBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";

export function agingBucket(dueAt: Date | null, now = new Date()): AgingBucket {
  if (!dueAt || dueAt > now) return "current";
  const days = Math.floor((now.getTime() - dueAt.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

export type AgingRow = {
  accountId: number;
  company: string;
  email: string;
  creditLimit: number;
  buckets: Record<AgingBucket, number>;
  total: number;
  oldestDueAt: string | null;
};

/** ODE-6: what every account owes, by how late it is. */
export async function agingReport(now = new Date()): Promise<AgingRow[]> {
  const rows = await db
    .select({
      userId: orders.userId,
      email: orders.email,
      company: orders.company,
      total: orders.total,
      refunded: orders.refundedAmount,
      dueAt: orders.dueAt,
      creditLimit: users.creditLimit,
    })
    .from(orders)
    .leftJoin(users, eq(users.id, orders.userId))
    .where(
      and(
        inArray(orders.paymentStatus, [...OPEN_INVOICE_STATES]),
        sql`${orders.status} <> 'cancelled'`,
        or(sql`${orders.userId} is not null`, sql`${orders.email} is not null`),
      ),
    );

  const byAccount = new Map<string, AgingRow>();
  for (const row of rows) {
    const key = row.userId ? `u${row.userId}` : `e${row.email}`;
    const entry =
      byAccount.get(key) ??
      ({
        accountId: row.userId ?? 0,
        company: row.company ?? row.email,
        email: row.email,
        creditLimit: row.creditLimit ?? 0,
        buckets: { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 },
        total: 0,
        oldestDueAt: null,
      } satisfies AgingRow);
    const outstanding = Math.max(0, row.total - row.refunded);
    entry.buckets[agingBucket(row.dueAt, now)] += outstanding;
    entry.total += outstanding;
    if (row.dueAt && (!entry.oldestDueAt || row.dueAt.toISOString() < entry.oldestDueAt)) {
      entry.oldestDueAt = row.dueAt.toISOString();
    }
    byAccount.set(key, entry);
  }
  return [...byAccount.values()].sort((a, b) => b.total - a.total);
}

/** Invoice orders whose due date has passed, for the nightly reminder. */
export async function overdueInvoices(now = new Date()) {
  return db
    .select({ orderNumber: orders.orderNumber, email: orders.email, total: orders.total, refunded: orders.refundedAmount, dueAt: orders.dueAt })
    .from(orders)
    .where(
      and(
        inArray(orders.paymentStatus, [...OPEN_INVOICE_STATES]),
        sql`${orders.status} <> 'cancelled'`,
        lt(orders.dueAt, now),
      ),
    )
    .limit(200);
}
