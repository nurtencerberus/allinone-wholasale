import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, wholesaleApplications } from "@/db/schema";
import { requireStaff, staffDenied } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { sendEmail, wholesaleDecisionTemplate } from "@/lib/email";
import { appOrigin } from "@/lib/site";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireStaff("accounts");
    if (!admin) return staffDenied();

    const { id } = await context.params;
    const applicationId = Number(id);
    if (!Number.isFinite(applicationId)) {
      return Response.json({ error: "Invalid application id." }, { status: 400 });
    }

    const body = (await request.json()) as {
      action?: "approve" | "reject";
      discountPct?: number;
      taxExempt?: boolean;
      taxExemptCertNumber?: string;
      verifyEin?: boolean;
      reason?: string;
    };

    const [application] = await db
      .select()
      .from(wholesaleApplications)
      .where(eq(wholesaleApplications.id, applicationId))
      .limit(1);

    if (!application) return Response.json({ error: "Application not found." }, { status: 404 });
    if (application.status !== "pending") {
      return Response.json({ error: `This application was already ${application.status}.` }, { status: 409 });
    }

    if (body.action === "approve") {
      const discountPct = Math.min(Math.max(Math.round(body.discountPct ?? 5), 0), 40);
      const taxExempt = Boolean(body.taxExempt);
      const certNumber = (body.taxExemptCertNumber ?? "").trim().slice(0, 60);
      if (taxExempt && certNumber.length < 3) {
        return Response.json({ error: "Enter the resale certificate number to approve a tax exemption." }, { status: 400 });
      }

      await db
        .update(wholesaleApplications)
        .set({
          status: "approved",
          discountPct,
          taxExempt,
          verifiedEin: Boolean(body.verifyEin),
          rejectionReason: null,
          reviewedAt: new Date(),
        })
        .where(eq(wholesaleApplications.id, applicationId));

      // Only the account that submitted the application is upgraded. Matching by e-mail
      // would let anyone who registers a buyer's address inherit that buyer's approval.
      const targetId = application.userId;
      if (targetId) {
        await db
          .update(users)
          .set({
            accountTier: "wholesale",
            wholesaleDiscountPct: discountPct,
            taxExempt,
            // We collect tax only in New Jersey, so an exemption is recorded for NJ deliveries.
            taxExemptState: taxExempt ? "NJ" : null,
            taxExemptCertType: taxExempt ? "NJ ST-3" : null,
            taxExemptCertNumber: taxExempt ? certNumber : null,
            ein: application.ein,
            company: application.companyName,
          })
          .where(eq(users.id, targetId));
      }

      await recordAudit(db, {
        actor: admin,
        action: "application.approve",
        entityType: "application",
        entityId: applicationId,
        after: { userId: targetId, discountPct, taxExempt, certNumber: taxExempt ? certNumber : null, verifiedEin: Boolean(body.verifyEin) },
        request,
      });

      const template = wholesaleDecisionTemplate({
        company: application.companyName,
        approved: true,
        discountPct,
        url: `${appOrigin()}/login`,
      });
      await sendEmail({ to: application.email, subject: template.subject, html: template.html });

      return Response.json({
        ok: true,
        accountLinked: Boolean(targetId),
        message: `Approved with ${discountPct}% account pricing${taxExempt ? " and resale tax exemption" : ""}.`,
      });
    }

    if (body.action === "reject") {
      const reason = (body.reason ?? "").trim();
      if (reason.length < 5) {
        return Response.json({ error: "A rejection reason is required." }, { status: 400 });
      }

      await db
        .update(wholesaleApplications)
        .set({ status: "rejected", rejectionReason: reason, reviewedAt: new Date() })
        .where(eq(wholesaleApplications.id, applicationId));

      await recordAudit(db, {
        actor: admin,
        action: "application.reject",
        entityType: "application",
        entityId: applicationId,
        after: { reason },
        request,
      });

      const template = wholesaleDecisionTemplate({
        company: application.companyName,
        approved: false,
        discountPct: 0,
        reason,
        url: `${appOrigin()}/wholesale/apply`,
      });
      await sendEmail({ to: application.email, subject: template.subject, html: template.html });

      return Response.json({ ok: true, message: "Application rejected and applicant notified." });
    }

    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    console.error("[admin-application]", error);
    return Response.json({ error: "Review action failed." }, { status: 500 });
  }
}
