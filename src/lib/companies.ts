import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, companyInvites, users, type Company } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";
import { recordAudit, type AuditActor } from "@/lib/audit";
import { digestToken, randomToken } from "@/lib/password";

/**
 * UX-7: company accounts. Several people buy for one business and share its trade terms, its
 * agreed prices, its quotes and its order history.
 *
 * Terms (tier, discount, tax exemption) are canonical on the company row and copied onto every
 * member's user row by `syncCompanyTerms`. Pricing, the session and the admin screens keep
 * reading the single user field they always read, so nothing downstream had to be rewritten —
 * and someone removed from a company simply keeps the terms they had.
 */

export const COMPANY_ROLES = ["owner", "buyer", "viewer"] as const;
export type CompanyRole = (typeof COMPANY_ROLES)[number];

/** How long an invitation stands. */
export const INVITE_DAYS = 14;

export class CompanyError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function isCompanyRole(value: string | null | undefined): value is CompanyRole {
  return COMPANY_ROLES.includes(value as CompanyRole);
}

/** Only an owner manages members and terms. */
export function canManageCompany(user: Pick<SessionUser, "companyId" | "companyRole"> | null): boolean {
  return Boolean(user?.companyId && user.companyRole === "owner");
}

/** A buyer or owner may place orders; a viewer may only look. */
export function canOrderForCompany(user: Pick<SessionUser, "companyId" | "companyRole"> | null): boolean {
  return !user?.companyId || user.companyRole !== "viewer";
}

export async function companyFor(companyId: number | null | undefined): Promise<Company | null> {
  if (!companyId) return null;
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  return company ?? null;
}

export type Member = {
  id: number;
  email: string;
  name: string;
  companyRole: string | null;
  emailVerified: boolean;
  createdAt: string;
};

export async function membersOf(companyId: number): Promise<Member[]> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      companyRole: users.companyRole,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.companyId, companyId))
    .orderBy(asc(users.createdAt));
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export type PendingInvite = { id: number; email: string; companyRole: string; expiresAt: string };

export async function pendingInvites(companyId: number): Promise<PendingInvite[]> {
  const rows = await db
    .select({ id: companyInvites.id, email: companyInvites.email, companyRole: companyInvites.companyRole, expiresAt: companyInvites.expiresAt })
    .from(companyInvites)
    .where(and(eq(companyInvites.companyId, companyId), isNull(companyInvites.acceptedAt)))
    .orderBy(asc(companyInvites.createdAt));
  return rows.filter((row) => row.expiresAt > new Date()).map((row) => ({ ...row, expiresAt: row.expiresAt.toISOString() }));
}

/** Copy the company's terms onto its members, which is what pricing and the session read. */
type Executor = Pick<typeof db, "select" | "update">;

export async function syncCompanyTerms(companyId: number, tx: Executor = db): Promise<void> {
  const [company] = await tx.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  if (!company) return;
  await tx
    .update(users)
    .set({
      accountTier: company.accountTier,
      wholesaleDiscountPct: company.wholesaleDiscountPct,
      taxExempt: company.taxExempt,
      taxExemptState: company.taxExemptState,
      taxExemptCertType: company.taxExemptCertType,
      taxExemptCertNumber: company.taxExemptCertNumber,
      taxExemptExpires: company.taxExemptExpires,
      company: company.name,
      ein: company.ein,
    })
    // Staff accounts keep their own role and are never re-termed by a company.
    .where(and(eq(users.companyId, companyId), eq(users.role, "customer")));
}

/**
 * Turn a single account into a company account, with this user as its owner. The company starts
 * from the terms the account already had, so nothing about their pricing changes.
 */
export async function createCompanyForUser(user: SessionUser, name: string, actor: AuditActor, request?: Request): Promise<Company> {
  if (user.companyId) throw new CompanyError("This account already belongs to a company.", 409);
  const clean = name.trim().slice(0, 120);
  if (clean.length < 2) throw new CompanyError("Enter the company name.");

  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(users).where(eq(users.id, user.id)).limit(1);
    const [company] = await tx
      .insert(companies)
      .values({
        name: clean,
        accountTier: row.accountTier,
        wholesaleDiscountPct: row.wholesaleDiscountPct,
        taxExempt: row.taxExempt,
        taxExemptState: row.taxExemptState,
        taxExemptCertType: row.taxExemptCertType,
        taxExemptCertNumber: row.taxExemptCertNumber,
        taxExemptExpires: row.taxExemptExpires,
        ein: row.ein,
      })
      .returning();
    await tx.update(users).set({ companyId: company.id, companyRole: "owner", company: clean }).where(eq(users.id, user.id));
    await recordAudit(tx, {
      actor,
      action: "company.create",
      entityType: "company",
      entityId: company.id,
      after: { name: clean, owner: user.email },
      request,
    });
    return company;
  });
}

/** Invite a colleague. The token goes in the e-mail; only its digest is stored. */
export async function inviteToCompany(input: {
  company: Company;
  email: string;
  role: CompanyRole;
  actor: AuditActor;
  invitedBy: number;
  request?: Request;
}): Promise<{ token: string; email: string }> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new CompanyError("Enter a valid e-mail address.");
  if (!isCompanyRole(input.role)) throw new CompanyError("Unknown role.");

  const [existing] = await db.select({ id: users.id, companyId: users.companyId }).from(users).where(eq(users.email, email)).limit(1);
  if (existing?.companyId && existing.companyId !== input.company.id) {
    throw new CompanyError("That person already belongs to another company account.", 409);
  }
  if (existing?.companyId === input.company.id) throw new CompanyError("They are already on this account.", 409);

  const token = randomToken(24);
  await db.transaction(async (tx) => {
    // One open invitation per address: a re-invite replaces the old one.
    await tx.delete(companyInvites).where(and(eq(companyInvites.companyId, input.company.id), eq(companyInvites.email, email), isNull(companyInvites.acceptedAt)));
    await tx.insert(companyInvites).values({
      companyId: input.company.id,
      email,
      companyRole: input.role,
      tokenDigest: digestToken(token),
      invitedBy: input.invitedBy,
      expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
    });
    await recordAudit(tx, {
      actor: input.actor,
      action: "company.invite",
      entityType: "company",
      entityId: input.company.id,
      after: { email, role: input.role },
      request: input.request,
    });
  });
  return { token, email };
}

/**
 * Accept an invitation. The signed-in account must be the one that was invited — otherwise a
 * forwarded link would hand someone else the company's prices and order history.
 */
export async function acceptInvite(token: string, user: SessionUser, request?: Request): Promise<Company> {
  const digest = digestToken(token);
  const [invite] = await db.select().from(companyInvites).where(eq(companyInvites.tokenDigest, digest)).limit(1);
  if (!invite || invite.acceptedAt || invite.expiresAt <= new Date()) {
    throw new CompanyError("That invitation is no longer valid. Ask for a new one.", 410);
  }
  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    throw new CompanyError("This invitation was sent to a different e-mail address.", 403);
  }
  if (user.companyId && user.companyId !== invite.companyId) {
    throw new CompanyError("Leave your current company account before joining another.", 409);
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(companyInvites)
      .set({ acceptedAt: new Date() })
      .where(and(eq(companyInvites.id, invite.id), isNull(companyInvites.acceptedAt)))
      .returning();
    if (!row) throw new CompanyError("That invitation was just used.", 410);

    await tx.update(users).set({ companyId: invite.companyId, companyRole: invite.companyRole }).where(eq(users.id, user.id));
    await syncCompanyTerms(invite.companyId, tx);
    await recordAudit(tx, {
      actor: { id: user.id, email: user.email },
      action: "company.join",
      entityType: "company",
      entityId: invite.companyId,
      after: { email: user.email, role: invite.companyRole },
      request,
    });
    const [company] = await tx.select().from(companies).where(eq(companies.id, invite.companyId)).limit(1);
    return company;
  });
}

/** An owner removes a colleague, or revokes an invitation that has not been used. */
export async function removeMember(input: { company: Company; memberId: number; actor: AuditActor; request?: Request }): Promise<void> {
  const [member] = await db.select().from(users).where(eq(users.id, input.memberId)).limit(1);
  if (!member || member.companyId !== input.company.id) throw new CompanyError("That person is not on this account.", 404);
  if (member.companyRole === "owner") {
    const [{ owners }] = await db
      .select({ owners: sql<number>`count(*)::int` })
      .from(users)
      .where(and(eq(users.companyId, input.company.id), eq(users.companyRole, "owner")));
    if (owners <= 1) throw new CompanyError("A company account needs an owner. Make someone else the owner first.", 409);
  }
  await db.transaction(async (tx) => {
    await tx.update(users).set({ companyId: null, companyRole: null }).where(eq(users.id, input.memberId));
    await recordAudit(tx, {
      actor: input.actor,
      action: "company.remove-member",
      entityType: "company",
      entityId: input.company.id,
      before: { email: member.email, role: member.companyRole },
      request: input.request,
    });
  });
}

export async function setMemberRole(input: { company: Company; memberId: number; role: CompanyRole; actor: AuditActor; request?: Request }): Promise<void> {
  if (!isCompanyRole(input.role)) throw new CompanyError("Unknown role.");
  const [member] = await db.select().from(users).where(eq(users.id, input.memberId)).limit(1);
  if (!member || member.companyId !== input.company.id) throw new CompanyError("That person is not on this account.", 404);
  if (member.companyRole === "owner" && input.role !== "owner") {
    const [{ owners }] = await db
      .select({ owners: sql<number>`count(*)::int` })
      .from(users)
      .where(and(eq(users.companyId, input.company.id), eq(users.companyRole, "owner")));
    if (owners <= 1) throw new CompanyError("A company account needs an owner.", 409);
  }
  await db.transaction(async (tx) => {
    await tx.update(users).set({ companyRole: input.role }).where(eq(users.id, input.memberId));
    await recordAudit(tx, {
      actor: input.actor,
      action: "company.set-role",
      entityType: "company",
      entityId: input.company.id,
      before: { email: member.email, role: member.companyRole },
      after: { role: input.role },
      request: input.request,
    });
  });
}

/** The accounts whose orders, quotes and prices this viewer may see: themselves and colleagues. */
export function companyScope(user: Pick<SessionUser, "id" | "companyId">) {
  return user.companyId
    ? or(eq(users.companyId, user.companyId), eq(users.id, user.id))!
    : eq(users.id, user.id);
}
