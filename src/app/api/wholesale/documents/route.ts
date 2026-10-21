import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { applicationDocuments, wholesaleApplications } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import {
  DOCUMENT_LABELS,
  documentsFor,
  isDocumentKind,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENTS_PER_APPLICATION,
  sniffDocument,
} from "@/lib/application-docs";
import { clientIp, consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * KYT-11: the applicant uploads the paperwork the desk is meant to verify — resale certificate,
 * W-9, licence. Only onto their own application, and only while it is still being reviewed.
 */
async function ownApplication(userId: number) {
  const [application] = await db
    .select({ id: wholesaleApplications.id, status: wholesaleApplications.status })
    .from(wholesaleApplications)
    .where(eq(wholesaleApplications.userId, userId))
    .orderBy(desc(wholesaleApplications.createdAt))
    .limit(1);
  return application ?? null;
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const application = await ownApplication(user.id);
  if (!application) return Response.json({ ok: true, documents: [] });
  return Response.json({ ok: true, documents: await documentsFor(application.id) });
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });

    const limit = await consumeRateLimit("application-docs", `${user.id}:${clientIp(request)}`, 20, 60 * 60);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

    const application = await ownApplication(user.id);
    if (!application) return Response.json({ error: "Apply for a trade account first." }, { status: 404 });
    if (application.status === "rejected") {
      return Response.json({ error: "This application was closed. Start a new one to send documents." }, { status: 409 });
    }

    const form = await request.formData();
    const file = form.get("file");
    const kind = String(form.get("kind") ?? "other");
    if (!(file instanceof File) || file.size === 0) return Response.json({ error: "Choose a file." }, { status: 400 });
    if (!isDocumentKind(kind)) return Response.json({ error: "Unknown document type." }, { status: 400 });
    if (file.size > MAX_DOCUMENT_BYTES) return Response.json({ error: "Documents are limited to 4 MB." }, { status: 400 });

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(applicationDocuments)
      .where(eq(applicationDocuments.applicationId, application.id));
    if (count >= MAX_DOCUMENTS_PER_APPLICATION) {
      return Response.json({ error: `Up to ${MAX_DOCUMENTS_PER_APPLICATION} documents per application.` }, { status: 409 });
    }

    const data = Buffer.from(await file.arrayBuffer());
    const sniffed = sniffDocument(data);
    if (!sniffed) {
      return Response.json({ error: "Send a PDF or a photo (JPEG, PNG or WebP) of the document." }, { status: 422 });
    }

    const [saved] = await db
      .insert(applicationDocuments)
      .values({
        applicationId: application.id,
        kind,
        filename: file.name.slice(0, 160) || `document.${sniffed.ext}`,
        mime: sniffed.mime,
        bytes: data.length,
        content: data,
        uploadedBy: user.id,
      })
      .returning({ id: applicationDocuments.id });

    return Response.json({
      ok: true,
      id: saved.id,
      message: `${DOCUMENT_LABELS[kind]} received. The trade desk sees it with your application.`,
    });
  } catch (error) {
    console.error("[application-document-upload]", error);
    return Response.json({ error: "Could not store that document." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
    const application = await ownApplication(user.id);
    if (!application) return Response.json({ error: "Nothing to remove." }, { status: 404 });
    if (application.status === "approved") {
      return Response.json({ error: "An approved application keeps its paperwork." }, { status: 409 });
    }

    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id < 1) return Response.json({ error: "Unknown document." }, { status: 400 });

    const [removed] = await db
      .delete(applicationDocuments)
      .where(and(eq(applicationDocuments.id, id), eq(applicationDocuments.applicationId, application.id)))
      .returning({ id: applicationDocuments.id });
    if (!removed) return Response.json({ error: "That document is not on your application." }, { status: 404 });
    return Response.json({ ok: true, message: "Document removed." });
  } catch (error) {
    console.error("[application-document-delete]", error);
    return Response.json({ error: "Could not remove that document." }, { status: 500 });
  }
}
