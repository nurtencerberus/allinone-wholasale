import { and, asc, eq, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { applicationDocuments, users, wholesaleApplications } from "@/db/schema";
import { sniffImage } from "@/lib/product-input";

/**
 * KYT-11: the paperwork and the identity checks behind a wholesale application.
 *
 * Two things the trade desk could not do before: see the resale certificate it was supposed to
 * be verifying, and notice that an EIN already belonged to another account.
 */

export const DOCUMENT_KINDS = ["resale_certificate", "w9", "business_license", "other"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_LABELS: Record<DocumentKind, string> = {
  resale_certificate: "Resale certificate",
  w9: "W-9",
  business_license: "Business licence",
  other: "Other document",
};

/** Vercel caps a request body at 4.5 MB; the rest of the app uses 4 MB and so does this. */
export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
/** Enough for a certificate and a licence, few enough that nobody fills the table. */
export const MAX_DOCUMENTS_PER_APPLICATION = 6;

export function isDocumentKind(value: string): value is DocumentKind {
  return (DOCUMENT_KINDS as readonly string[]).includes(value);
}

/**
 * What the bytes actually are, not what the upload claimed. A certificate is a PDF or a photo;
 * anything else is refused rather than stored and served back later.
 */
export function sniffDocument(data: Buffer): { mime: string; ext: string } | null {
  if (data.length > 5 && data.subarray(0, 5).toString("ascii") === "%PDF-") {
    return { mime: "application/pdf", ext: "pdf" };
  }
  const image = sniffImage(data);
  return image && image.mime !== "image/gif" ? image : null;
}

/** EINs are compared without punctuation; they are stored as 12-3456789. */
export function normaliseEin(ein: string): string {
  const digits = (ein ?? "").replace(/\D/g, "");
  return digits.length === 9 ? `${digits.slice(0, 2)}-${digits.slice(2)}` : (ein ?? "").trim();
}

export type EinMatch = { kind: "account" | "application"; id: number; label: string; detail: string };

/**
 * Other places this EIN already appears. A match is not necessarily fraud — a second buyer at
 * the same business is the ordinary case, and company accounts exist for exactly that — so this
 * warns the desk rather than refusing the application.
 */
export async function einMatches(ein: string, excludeApplicationId?: number): Promise<EinMatch[]> {
  const normalised = normaliseEin(ein);
  const digits = normalised.replace(/\D/g, "");
  if (digits.length !== 9) return [];

  const accounts = await db
    .select({ id: users.id, email: users.email, company: users.company, tier: users.accountTier })
    .from(users)
    .where(sql`regexp_replace(coalesce(${users.ein}, ''), '[^0-9]', '', 'g') = ${digits}`);

  const applications = await db
    .select({
      id: wholesaleApplications.id,
      company: wholesaleApplications.companyName,
      email: wholesaleApplications.email,
      status: wholesaleApplications.status,
    })
    .from(wholesaleApplications)
    .where(
      and(
        sql`regexp_replace(${wholesaleApplications.ein}, '[^0-9]', '', 'g') = ${digits}`,
        excludeApplicationId ? ne(wholesaleApplications.id, excludeApplicationId) : undefined,
        or(eq(wholesaleApplications.status, "approved"), eq(wholesaleApplications.status, "pending")),
      ),
    );

  return [
    ...accounts.map((row) => ({
      kind: "account" as const,
      id: row.id,
      label: row.company || row.email,
      detail: `${row.email} · ${row.tier === "wholesale" ? "approved trade account" : "retail account"}`,
    })),
    ...applications.map((row) => ({
      kind: "application" as const,
      id: row.id,
      label: row.company,
      detail: `${row.email} · application ${row.status}`,
    })),
  ];
}

export type DocumentSummary = {
  id: number;
  kind: string;
  label: string;
  filename: string;
  mime: string;
  bytes: number;
  createdAt: string;
};

export async function documentsFor(applicationId: number): Promise<DocumentSummary[]> {
  const rows = await db
    .select({
      id: applicationDocuments.id,
      kind: applicationDocuments.kind,
      filename: applicationDocuments.filename,
      mime: applicationDocuments.mime,
      bytes: applicationDocuments.bytes,
      createdAt: applicationDocuments.createdAt,
    })
    .from(applicationDocuments)
    .where(eq(applicationDocuments.applicationId, applicationId))
    .orderBy(asc(applicationDocuments.createdAt));

  return rows.map((row) => ({
    ...row,
    label: DOCUMENT_LABELS[row.kind as DocumentKind] ?? "Document",
    createdAt: row.createdAt.toISOString(),
  }));
}
