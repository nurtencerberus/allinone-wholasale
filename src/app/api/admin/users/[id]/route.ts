import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { NEXUS_STATES } from "@/lib/tax";
import { escapeHtml, sendEmail } from "@/lib/email";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    if (!admin) return Response.json({ error: "Admin access required." }, { status: 403 });

    const { id } = await context.params;
    const userId = Number(id);
    if (!Number.isFinite(userId)) {
      return Response.json({ error: "Invalid user id." }, { status: 400 });
    }

    const body = (await request.json()) as {
      discountPct?: number;
      taxExempt?: boolean;
      taxExemptState?: string;
      taxExemptCertType?: string;
      taxExemptCertNumber?: string;
      taxExemptExpires?: string | null;
      role?: string;
      accountTier?: string;
      verifyEmail?: boolean;
    };

    const [existing] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!existing) return Response.json({ error: "Account not found." }, { status: 404 });

    const patch: Partial<typeof users.$inferInsert> = {};

    if (body.discountPct !== undefined) {
      const value = Math.round(Number(body.discountPct));
      if (!Number.isFinite(value) || value < 0 || value > 40) {
        return Response.json({ error: "Discount must be between 0 and 40%." }, { status: 400 });
      }
      patch.wholesaleDiscountPct = value;
    }

    if (body.taxExempt !== undefined) {
      if (body.taxExempt) {
        // An exemption is only as good as the certificate behind it, and only for its state.
        const state = (body.taxExemptState ?? existing.taxExemptState ?? "NJ").trim().toUpperCase();
        if (!NEXUS_STATES.includes(state)) {
          return Response.json(
            { error: `Exemptions apply only in states where we collect tax (${NEXUS_STATES.join(", ")}).` },
            { status: 400 },
          );
        }
        const certNumber = (body.taxExemptCertNumber ?? existing.taxExemptCertNumber ?? "").trim();
        if (certNumber.length < 3) {
          return Response.json({ error: "Enter the resale certificate number to grant an exemption." }, { status: 400 });
        }
        let expires: Date | null = existing.taxExemptExpires;
        if (body.taxExemptExpires !== undefined) {
          expires = body.taxExemptExpires ? new Date(body.taxExemptExpires) : null;
          if (expires && Number.isNaN(expires.getTime())) {
            return Response.json({ error: "Certificate expiry must be a valid date." }, { status: 400 });
          }
        }
        patch.taxExempt = true;
        patch.taxExemptState = state;
        patch.taxExemptCertNumber = certNumber.slice(0, 60);
        patch.taxExemptCertType = (body.taxExemptCertType ?? existing.taxExemptCertType ?? "NJ ST-3").trim().slice(0, 30);
        patch.taxExemptExpires = expires;
      } else {
        patch.taxExempt = false;
      }
    }

    if (body.role !== undefined) {
      if (!["customer", "admin"].includes(body.role)) {
        return Response.json({ error: "Role must be customer or admin." }, { status: 400 });
      }
      if (existing.id === admin.id && body.role !== "admin") {
        return Response.json({ error: "You cannot remove your own admin access." }, { status: 400 });
      }
      patch.role = body.role;
    }

    if (body.accountTier !== undefined) {
      if (!["retail", "wholesale"].includes(body.accountTier)) {
        return Response.json({ error: "Tier must be retail or wholesale." }, { status: 400 });
      }
      patch.accountTier = body.accountTier;
      // Pricing, terms and exemption are trade privileges; a downgrade removes them.
      if (body.accountTier === "retail") {
        patch.taxExempt = false;
        patch.wholesaleDiscountPct = 0;
      }
    }

    if (body.verifyEmail === true) {
      patch.emailVerified = true;
      patch.verificationToken = null;
      patch.verificationExpires = null;
    }

    if (Object.keys(patch).length === 0) {
      return Response.json({ error: "No changes supplied." }, { status: 400 });
    }

    const [updated] = await db.update(users).set(patch).where(eq(users.id, userId)).returning();
    if (!updated) return Response.json({ error: "Update failed." }, { status: 500 });

    if (body.verifyEmail === true && !existing.emailVerified) {
      await sendEmail({
        to: updated.email,
        subject: "Your Ciputra email is confirmed",
        html: `<p>Hi ${escapeHtml(updated.name.split(" ")[0])},</p><p>Your email address has been confirmed by the Ciputra trade desk. Ordering is now enabled on your account.</p><p>— Ciputra Corp.</p>`,
      });
    }

    return Response.json({
      ok: true,
      account: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        accountTier: updated.accountTier,
        wholesaleDiscountPct: updated.wholesaleDiscountPct,
        taxExempt: updated.taxExempt,
        taxExemptState: updated.taxExemptState,
        taxExemptCertNumber: updated.taxExemptCertNumber,
        emailVerified: updated.emailVerified,
      },
      message: `${updated.email} updated.`,
    });
  } catch (error) {
    console.error("[admin-user-update]", error);
    return Response.json({ error: "Could not update the account." }, { status: 500 });
  }
}
