import { getSessionUser } from "@/lib/auth";
import {
  acceptInvite,
  canManageCompany,
  CompanyError,
  companyFor,
  createCompanyForUser,
  inviteToCompany,
  removeMember,
  setMemberRole,
  type CompanyRole,
} from "@/lib/companies";
import { escapeHtml, sendEmail } from "@/lib/email";
import { clientIp, consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { appOrigin } from "@/lib/site";
import { demoModeEnabled } from "@/lib/demo-mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * UX-7: company accounts. Creating one, inviting colleagues, changing their role, removing
 * them, and accepting an invitation. Everything but "accept" is for the company's owner.
 */
export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const actor = { id: user.id, email: user.email };

    if (action === "create") {
      const company = await createCompanyForUser(user, String(body.name ?? ""), actor, request);
      return Response.json({ ok: true, company, message: `${company.name} is now a company account. Invite your colleagues.` });
    }

    if (action === "accept") {
      const company = await acceptInvite(String(body.token ?? ""), user, request);
      return Response.json({ ok: true, company, message: `You are now on the ${company.name} account.` });
    }

    const company = await companyFor(user.companyId);
    if (!company || !canManageCompany(user)) {
      return Response.json({ error: "Only the owner of a company account can do that." }, { status: 403 });
    }

    if (action === "invite") {
      const limit = await consumeRateLimit("company-invite", `${user.id}:${clientIp(request)}`, 20, 24 * 60 * 60);
      if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

      const { token, email } = await inviteToCompany({
        company,
        email: String(body.email ?? ""),
        role: String(body.role ?? "buyer") as CompanyRole,
        actor,
        invitedBy: user.id,
        request,
      });
      const url = `${appOrigin()}/invite?token=${token}`;
      let delivered = true;
      try {
        const result = await sendEmail({
          to: email,
          subject: `${company.name} invited you to order on their trade account`,
          html: `<p>${escapeHtml(user.name)} invited you to buy on the <strong>${escapeHtml(company.name)}</strong> account at Ciputra Corp.</p><p><a href="${url}">Accept the invitation</a></p><p style="color:#6b7a71;font-size:12px">The link works for 14 days and only for ${escapeHtml(email)}.</p>`,
        });
        delivered = result.provider !== "console";
      } catch (error) {
        console.error("[company-invite-email]", error);
        delivered = false;
      }
      // Never put an invitation link in an API answer on a live site: it is an account key.
      return Response.json({
        ok: true,
        message: delivered ? `Invitation sent to ${email}.` : `Invitation created for ${email}, but the e-mail could not be sent.`,
        ...(delivered || !demoModeEnabled() ? {} : { inviteUrl: url }),
      });
    }

    if (action === "set-role") {
      await setMemberRole({ company, memberId: Number(body.memberId), role: String(body.role ?? "") as CompanyRole, actor, request });
      return Response.json({ ok: true, message: "Role updated." });
    }

    if (action === "remove") {
      await removeMember({ company, memberId: Number(body.memberId), actor, request });
      return Response.json({ ok: true, message: "Removed from the account." });
    }

    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    if (error instanceof CompanyError) return Response.json({ error: error.message }, { status: error.status });
    console.error("[company]", error);
    return Response.json({ error: "Could not update the company account." }, { status: 500 });
  }
}
