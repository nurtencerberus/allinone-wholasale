/**
 * One switch for "this is a demo/sandbox deployment".
 *
 * Demo mode (default): demo logins and sample orders are seeded, and when an e-mail
 * cannot be delivered the sign-up / reset links are shown on screen so the flows stay
 * testable without a mail provider.
 *
 * Live mode (SEED_DEMO_DATA=false): nothing is seeded and account links are NEVER
 * returned to the browser — they only travel by e-mail. Returning a reset link in an
 * API response would let anyone take over any account.
 */
export function demoModeEnabled(): boolean {
  const flag = (process.env.SEED_DEMO_DATA ?? "").trim().toLowerCase() || "true";
  return !["false", "0", "off", "no"].includes(flag);
}
