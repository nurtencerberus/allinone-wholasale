import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { applicationDocuments } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { requireStaff, staffDenied } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * KYT-11: the desk opens a document from an application. Staff only, never cached, and the
 * download is written to the audit log — a resale certificate carries a tax ID.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string; docId: string }> }) {
  const admin = await requireStaff("accounts");
  if (!admin) return staffDenied();

  const { id, docId } = await context.params;
  const applicationId = Number(id);
  const documentId = Number(docId);
  if (!Number.isInteger(applicationId) || !Number.isInteger(documentId)) {
    return Response.json({ error: "Unknown document." }, { status: 400 });
  }

  const [row] = await db
    .select()
    .from(applicationDocuments)
    .where(and(eq(applicationDocuments.id, documentId), eq(applicationDocuments.applicationId, applicationId)))
    .limit(1);
  if (!row) return Response.json({ error: "Document not found." }, { status: 404 });

  await recordAudit(db, {
    actor: admin,
    action: "application.document-view",
    entityType: "application",
    entityId: applicationId,
    after: { document: row.filename, kind: row.kind },
    request,
  });

  return new Response(new Uint8Array(row.content), {
    headers: {
      "content-type": row.mime,
      "content-length": String(row.bytes),
      "content-disposition": `inline; filename="${row.filename.replace(/["\\]/g, "")}"`,
      "cache-control": "private, no-store",
    },
  });
}
