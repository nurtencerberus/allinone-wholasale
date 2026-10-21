import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { requireStaff, staffDenied } from "@/lib/auth";
import { diffFields, recordAudit } from "@/lib/audit";
import { NEXUS_STATES } from "@/lib/tax";
import { escapeHtml, sendEmail } from "@/lib/email";
import { verifyPasswordOrDummy } from "@/lib/password";
import { hasPermission, isStaffRole, ROLE_LABELS, ROLES } from "@/lib/staff";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireStaff("view");
    if (!admin) return staffDenied();

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
      resetTwoFactor?: boolean;
      /** The acting owner's own password, required for role changes and two-factor resets. */
      currentPassword?: string;
    };

    // Field-level permissions: trade terms need "accounts", staff roles need "staff".
    const touchesAccount = ["discountPct", "taxExempt", "accountTier", "verifyEmail"].some(
      (key) => body[key as keyof typeof body] !== undefined,
    );
    const touchesStaff = body.role !== undefined || body.resetTwoFactor === true;
    if (touchesAccount && !hasPermission(admin, "accounts")) return staffDenied();
    if (touchesStaff && !hasPermission(admin, "staff")) return staffDenied();

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

    if (touchesStaff) {
      // Re-authenticate: a hijacked session alone must not be able to mint new staff.
      const [actor] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, admin.id)).limit(1);
      if (!(await verifyPasswordOrDummy(String(body.currentPassword ?? ""), actor?.passwordHash))) {
        return Response.json({ error: "Enter your own password to change staff access." }, { status: 400 });
      }
    }

    if (body.role !== undefined && body.role !== existing.role) {
      if (!(ROLES as readonly string[]).includes(body.role)) {
        return Response.json({ error: `Role must be one of: ${ROLES.join(", ")}.` }, { status: 400 });
      }
      if (existing.id === admin.id) {
        return Response.json({ error: "You cannot change your own role. Ask another owner." }, { status: 400 });
      }
      if (isStaffRole(body.role) && !existing.emailVerified) {
        return Response.json({ error: "Only accounts with a confirmed email can be given staff access." }, { status: 400 });
      }
      patch.role = body.role;
    }

    if (body.resetTwoFactor === true) {
      if (existing.id === admin.id) {
        return Response.json({ error: "Reset your own two-factor sign-in from the account security page." }, { status: 400 });
      }
      patch.totpSecret = null;
      patch.totpPendingSecret = null;
      patch.totpEnabledAt = null;
      patch.totpLastStep = null;
      patch.recoveryCodes = [];
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

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx.update(users).set(patch).where(eq(users.id, userId)).returning();
      if (!row) return null;
      // Role or second-factor changes end every session, so the new rules apply at once.
      if (patch.role !== undefined || body.resetTwoFactor === true) {
        await tx.delete(sessions).where(eq(sessions.userId, userId));
      }
      const { totpSecret: _secret, totpPendingSecret: _pending, recoveryCodes: _codes, ...auditable } = patch;
      void _secret;
      void _pending;
      void _codes;
      const diff = diffFields(existing as unknown as Record<string, unknown>, auditable as Record<string, unknown>);
      if (body.resetTwoFactor === true) diff.after.twoFactor = "reset";
      await recordAudit(tx, {
        actor: { id: admin.id, email: admin.email },
        action: patch.role !== undefined ? "user.role" : body.resetTwoFactor ? "user.two_factor_reset" : "user.update",
        entityType: "user",
        entityId: userId,
        before: diff.before,
        after: diff.after,
        request,
      });
      return row;
    });
    if (!updated) return Response.json({ error: "Update failed." }, { status: 500 });

    if (patch.role !== undefined || body.resetTwoFactor === true) {
      const what =
        patch.role !== undefined
          ? `Your account role was changed from ${ROLE_LABELS[existing.role] ?? existing.role} to ${ROLE_LABELS[updated.role] ?? updated.role} by ${admin.email}.`
          : `Two-factor sign-in on your account was reset by ${admin.email}. Set it up again at your next sign-in.`;
      try {
        await sendEmail({
          to: updated.email,
          subject: "Your Ciputra account access changed",
          html: `<p>Hi ${escapeHtml(updated.name.split(" ")[0])},</p><p>${escapeHtml(what)}</p><p>You have been signed out everywhere. If you did not expect this, contact the trade desk.</p>`,
        });
      } catch (error) {
        console.error("[admin-user-email]", error);
      }
    }

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
        twoFactorEnabled: Boolean(updated.totpEnabledAt),
      },
      message: `${updated.email} updated.`,
    });
  } catch (error) {
    console.error("[admin-user-update]", error);
    return Response.json({ error: "Could not update the account." }, { status: 500 });
  }
}
