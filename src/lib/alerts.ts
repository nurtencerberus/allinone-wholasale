import { consumeRateLimit } from "@/lib/rate-limit";
import { escapeHtml, sendEmail } from "@/lib/email";
import { appOrigin, SITE } from "@/lib/site";

/**
 * DEV-3: one place for "someone needs to look at this now". Money paths (payments, webhooks,
 * order writes) call `alertOps`; everything else keeps using console.error.
 *
 * Two rules keep it useful rather than noisy: every alert is also written to the log as one JSON
 * line so Vercel's log search and any drain can find it, and the same alert key only sends an
 * email once per window — a failing webhook retried fifty times must not send fifty emails.
 */

/** Minutes of quiet after an alert of the same kind before another email goes out. */
const ALERT_WINDOW_SECONDS = 15 * 60;

export type AlertLevel = "error" | "warn";

function line(level: AlertLevel, key: string, message: string, context?: Record<string, unknown>) {
  // One JSON object per line: greppable in Vercel logs, parseable by a drain.
  const payload = { at: new Date().toISOString(), level, alert: key, message, ...context };
  if (level === "error") console.error(JSON.stringify(payload));
  else console.warn(JSON.stringify(payload));
}

/**
 * Logs the event and emails the trade desk at most once per window per `key`. Never throws:
 * an alert that fails must not take down the request that raised it.
 */
export async function alertOps(input: {
  key: string;
  subject: string;
  message: string;
  context?: Record<string, unknown>;
  level?: AlertLevel;
}): Promise<void> {
  const level = input.level ?? "error";
  line(level, input.key, input.message, input.context);

  try {
    const window = await consumeRateLimit("ops-alert", input.key, 1, ALERT_WINDOW_SECONDS);
    if (!window.allowed) return;

    const rows = Object.entries(input.context ?? {})
      .map(([name, value]) => `<li><strong>${escapeHtml(name)}:</strong> ${escapeHtml(String(value))}</li>`)
      .join("");
    await sendEmail({
      to: process.env.OPS_EMAIL?.trim() || SITE.email,
      subject: `[${SITE.name}] ${input.subject}`,
      html: `<p>${escapeHtml(input.message)}</p>${rows ? `<ul>${rows}</ul>` : ""}<p><a href="${appOrigin()}/admin/orders">Open the admin console</a></p><p style="color:#6b7a71;font-size:12px">Further alerts of this kind are held for ${ALERT_WINDOW_SECONDS / 60} minutes.</p>`,
    });
  } catch (error) {
    console.error(JSON.stringify({ at: new Date().toISOString(), level: "error", alert: "ops-alert-failed", message: String(error) }));
  }
}

/** Shorthand for an unexpected error object. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}
