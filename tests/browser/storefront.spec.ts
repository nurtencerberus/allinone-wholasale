import { ACCOUNTS, addToCart, authForm, expect, signIn, test } from "./fixtures";
import { clearRateLimits } from "./db";

test.describe("storefront", () => {
  test.beforeEach(async () => {
    await clearRateLimits();
  });

  test("the home page and the catalog render for a signed-out visitor", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Open cart" })).toBeVisible();

    await page.goto("/shop");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // The price lock is a server rule (canSeePrices); this is the browser seeing its result.
    await expect(page.getByRole("link", { name: /Apply|wholesale/i }).first()).toBeVisible();
  });

  test("the cart drawer offers the trade portal instead of prices when signed out", async ({ page }) => {
    await page.goto("/shop");
    await page.getByRole("button", { name: "Open cart" }).click();

    const drawer = page.getByRole("dialog", { name: "Your order" });
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText("approved trade accounts");
    await expect(drawer.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Secure checkout" })).toHaveCount(0);
  });

  test("a wrong password keeps the buyer on the sign-in page with a message", async ({ page }) => {
    await page.goto("/login");
    const form = authForm(page);
    await form.getByLabel("Email address").fill(ACCOUNTS.buyer.email);
    await form.getByLabel("Password", { exact: true }).fill("not-the-password");
    await form.getByRole("button", { name: "Sign in" }).click();

    await expect(form.getByRole("alert")).toContainText("Invalid email or password");
    expect(new URL(page.url()).pathname).toBe("/login");
  });

  test("an approved buyer signs in and sees case prices on a product page", async ({ page }) => {
    await signIn(page, ACCOUNTS.buyer);
    expect(new URL(page.url()).pathname).toBe("/account");

    await page.goto("/shop");
    const firstProduct = page.locator('a[href^="/products/"]').first();
    await firstProduct.click();
    await expect(page.getByText("Trade case price")).toBeVisible();
    await expect(addToCart(page)).toBeVisible();
  });

  test("the catalog facets filter the grid from the sidebar", async ({ page }) => {
    await page.goto("/shop");
    // Nothing is filtered yet, so there is nothing to clear.
    await expect(page.getByRole("link", { name: "Clear" })).toHaveCount(0);

    // The facets are links: they work without JavaScript and the filtered view has a URL to share.
    await page.locator("aside a", { hasText: /^Ciputra/ }).first().click();
    await page.waitForURL(/brand=/);
    await expect(page.getByText(/of \d+ matching SKUs/)).toBeVisible();
    await expect(page.locator('a[href^="/products/"]').first()).toBeVisible();

    const clear = page.getByRole("link", { name: "Clear" });
    await expect(clear).toBeVisible();
    await clear.click();
    await page.waitForURL((url) => url.pathname === "/shop" && url.search === "");
    await expect(page.getByRole("link", { name: "Clear" })).toHaveCount(0);
  });

  test("a staff sign-in lands in the admin portal", async ({ page }) => {
    await signIn(page, ACCOUNTS.admin);
    expect(new URL(page.url()).pathname).toBe("/admin");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
