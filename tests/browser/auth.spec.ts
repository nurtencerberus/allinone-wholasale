import { authForm, expect, test } from "./fixtures";
import { clearRateLimits, q, totpCode } from "./db";

/**
 * The two-factor screen (KYT/SEP two-step sign-in). The HTTP suite proves the API; this proves
 * the screen a buyer or a staff member actually meets — the password step handing over to the code
 * step without a page load, a wrong code leaving them on it, and the right one signing them in.
 */
test("the code step takes over sign-in once two-factor is on", async ({ page }) => {
  await clearRateLimits();
  const email = `browser-2fa-${Date.now()}@example.com`;
  const password = "quiet-harbor-42";
  const secret = "JBSWY3DPEHPK3PXP";

  const signup = await page.request.post("/api/auth/signup", {
    data: { name: "Two Factor", email, password },
  });
  expect(signup.ok()).toBeTruthy();
  await q(
    `update users set email_verified = true, totp_secret = $2, totp_enabled_at = now(), totp_last_step = null
      where email = $1`,
    [email, secret],
  );

  await page.goto("/login");
  const form = authForm(page);
  await form.getByLabel("Email address").fill(email);
  await form.getByLabel("Password", { exact: true }).fill(password);
  await form.getByRole("button", { name: "Sign in" }).click();

  // The password alone must not sign anybody in.
  const codeField = form.getByLabel("Authentication code");
  await expect(codeField).toBeVisible();
  await expect(codeField).toBeFocused();
  expect(new URL(page.url()).pathname).toBe("/login");

  await codeField.fill("000000");
  await form.getByRole("button", { name: /Verify and sign in/ }).click();
  await expect(form.getByRole("alert")).toContainText(/not valid/i);
  await expect(codeField).toBeVisible();

  await codeField.fill(totpCode(secret));
  await form.getByRole("button", { name: /Verify and sign in/ }).click();
  await page.waitForURL(/\/account$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
