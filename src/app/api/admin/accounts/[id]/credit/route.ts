import { eq } from "drizzle-orm";
import { db } from "@/db";
import { companies, users } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { requireStaff, staffDenied } from "@/lib/auth";
import { syncCompanyTerms } from "@/lib/companies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ODE-6: the invoice terms of one account — credit limit, payment days and the hold flag.
 * Behind the "accounts" permission and audit-logged, like every other commercial term. When the
 * account belongs to a company the terms are written there and copied to every member.
 */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireStaff("accounts");
    if (!admin) return staffDenied();

    const id = Number((await context.params).id);
    if (!Number.isInteger(id) || id < 1) return Response.json({ error: "Unknown account." }, { status: 400 });

    const [account] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!account) return Response.json({ error: "Account not found." }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const dollars = Number(body.creditLimit);
    if (!Number.isFinite(dollars) || dollars < 0 || dollars > 10_000_000) {
      return Response.json({ error: "Credit limit must be between $0 and $10,000,000." }, { status: 400 });
    }
    const creditLimit = Math.round(dollars * 100);

    const days = Number(body.paymentTermsDays);
    if (!Number.isInteger(days) || days < 1 || days > 180) {
      return Response.json({ error: "Payment terms must be between 1 and 180 days." }, { status: 400 });
    }
    const creditHold = Boolean(body.creditHold);
    const terms = { creditLimit, paymentTermsDays: days, creditHold };

    await db.transaction(async (tx) => {
      if (account.companyId) {
        await tx.update(companies).set({ ...terms, updatedAt: new Date() }).where(eq(companies.id, account.companyId));
        await syncCompanyTerms(account.companyId, tx);
      } else {
        await tx.update(users).set(terms).where(eq(users.id, id));
      }
      await recordAudit(tx, {
        actor: admin,
        action: "account.credit-terms",
        entityType: "account",
        entityId: id,
        before: {
          creditLimit: account.creditLimit,
          paymentTermsDays: account.paymentTermsDays,
          creditHold: account.creditHold,
        },
        after: { ...terms, account: account.email, scope: account.companyId ? "company" : "account" },
        request,
      });
    });

    return Response.json({
      ok: true,
      message: account.companyId
        ? "Invoice terms saved for the whole company account."
        : "Invoice terms saved.",
    });
  } catch (error) {
    console.error("[admin-credit-terms]", error);
    return Response.json({ error: "Could not save the terms." }, { status: 500 });
  }
}
