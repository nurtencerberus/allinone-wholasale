import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { sendEmail } from "@/lib/email";

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
      patch.taxExempt = Boolean(body.taxExempt);
      patch.taxExemptState = body.taxExempt
        ? (body.taxExemptState ?? existing.taxExemptState ?? "US")
        : null;
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
        subject: "Your Meridian email is confirmed",
        html: `<p>Hi ${updated.name.split(" ")[0]},</p><p>Your email address has been confirmed by the Meridian trade desk. Ordering is now enabled on your account.</p><p>— Meridian Supply Co.</p>`,
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
        emailVerified: updated.emailVerified,
      },
      message: `${updated.email} updated.`,
    });
  } catch (error) {
    console.error("[admin-user-update]", error);
    return Response.json({ error: "Could not update the account." }, { status: 500 });
  }
}
