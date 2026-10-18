import { SITE } from "@/lib/site";

type EmailInput = {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
};

/** Names, company names and free text reach e-mail HTML: escape them everywhere. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type EmailResult = { sent: boolean; provider: "resend" | "console"; id?: string };

/**
 * Lightweight Resend integration using the built-in fetch REST API rather than
 * the heavier SDK. Falls back to console logging in environments without a key
 * so the double opt-in and reset flows stay testable.
 */
export async function sendEmail({ to, subject, html, replyTo }: EmailInput): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM?.trim() || `${SITE.name} <${SITE.email}>`;

  if (!apiKey) {
    console.info(`[email:dev] to=${to} subject="${subject}"`);
    return { sent: false, provider: "console" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, html, reply_to: replyTo }),
      cache: "no-store",
    });
    if (!response.ok) {
      console.error("[email] Resend error", response.status, await response.text());
      return { sent: false, provider: "resend" };
    }
    const data = (await response.json()) as { id?: string };
    return { sent: true, provider: "resend", id: data.id };
  } catch (error) {
    console.error("[email] Resend request failed", error);
    return { sent: false, provider: "resend" };
  }
}

const shell = (heading: string, body: string, cta?: { label: string; url: string }) => `
<div style="background:#F7F3EA;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;color:#14241C">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E4DCCB;border-radius:16px;overflow:hidden">
    <div style="background:#14241C;color:#F7F3EA;padding:20px 28px">
      <div style="font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#C9B78E">Meridian Supply Co.</div>
      <div style="font-size:14px;color:#D8D2C2;margin-top:4px">Wholesale · ${SITE.city}, ${SITE.state}</div>
    </div>
    <div style="padding:28px">
      <h1 style="font-family:Georgia,serif;font-size:24px;margin:0 0 12px">${heading}</h1>
      <div style="font-size:15px;line-height:1.6;color:#3B4A42">${body}</div>
      ${
        cta
          ? `<div style="margin-top:24px"><a href="${cta.url}" style="background:#14241C;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:14px;font-weight:600;display:inline-block">${cta.label}</a></div>
             <p style="font-size:12px;color:#7A857D;margin-top:18px;word-break:break-all">${cta.url}</p>`
          : ""
      }
    </div>
  </div>
  <p style="text-align:center;font-size:11px;color:#7A857D;margin-top:16px">${SITE.address} · ${SITE.email}</p>
</div>`;

export const verifyEmailTemplate = (name: string, url: string) => ({
  subject: "Confirm your Meridian trade account",
  html: shell(
    `Confirm your email, ${escapeHtml(name.split(" ")[0])}`,
    "You are one step from case pricing, dimensional freight quotes and resale tax exemption. Confirm your email address to activate ordering on your account. This link is single-use and expires in 24 hours.",
    { label: "Confirm email address", url },
  ),
});

export const resetPasswordTemplate = (url: string) => ({
  subject: "Reset your Meridian password",
  html: shell(
    "Reset your password",
    "Use the single-use link below to set a new password. The link expires in 60 minutes. If you did not request a reset, no action is needed and your password stays unchanged.",
    { label: "Set a new password", url },
  ),
});

export const orderConfirmationTemplate = (input: {
  orderNumber: string;
  name: string;
  total: string;
  url: string;
}) => ({
  subject: `Order ${escapeHtml(input.orderNumber)} confirmed · Meridian Supply Co.`,
  html: shell(
    `Thank you, ${escapeHtml(input.name.split(" ")[0])}.`,
    `Order <strong>${escapeHtml(input.orderNumber)}</strong> for <strong>${escapeHtml(input.total)}</strong> is confirmed and queued for picking at our ${SITE.city}, ${SITE.state} warehouse. Tracking is added to your account the moment the carrier scans the pallet.`,
    { label: "View order", url: input.url },
  ),
});

export const wholesaleDecisionTemplate = (input: {
  company: string;
  approved: boolean;
  discountPct: number;
  reason?: string | null;
  url: string;
}) => ({
  subject: input.approved
    ? "Your Meridian wholesale account is approved"
    : "Update on your Meridian wholesale application",
  html: shell(
    input.approved ? `Welcome aboard, ${escapeHtml(input.company)}` : `Application update · ${escapeHtml(input.company)}`,
    input.approved
      ? `Your trade application has been approved and your EIN verified. Account pricing of <strong>${input.discountPct}% off catalog case pricing</strong> is now active, and resale tax exemption is applied automatically at checkout.`
      : `We were not able to approve the application as submitted. Reason: ${escapeHtml(input.reason ?? "documentation could not be verified")}. You are welcome to reply with corrected documents and we will re-open the review.`,
    { label: "Open trade portal", url: input.url },
  ),
});
