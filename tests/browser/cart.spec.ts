import { ACCOUNTS, addToCart, expect, signIn, test } from "./fixtures";
import { clearRateLimits, stockedProduct, type TestProduct } from "./db";

/**
 * The cart drawer: the one piece of the shop with no server-rendered equivalent. SEP-3 keeps only
 * {productId, cases} in the browser and reads every price back from /api/cart — which means the
 * only way to prove a buyer sees the right price is to open the drawer in a browser.
 */
test.describe("cart drawer", () => {
  let product: TestProduct;

  test.beforeEach(async ({ page }) => {
    await clearRateLimits();
    product = await stockedProduct();
    await signIn(page, ACCOUNTS.buyer);
    // Start from an empty cart: the account's cart is kept on the server too (SEP-7).
    await page.goto("/account");
    await page.evaluate(() => window.localStorage.removeItem("ciputra_cart_v1"));
    await page.request.put("/api/cart", { data: { items: [] } });
  });

  test("adding cases opens the drawer and the price comes from the server", async ({ page }) => {
    await page.goto(`/products/${product.slug}`);
    await addToCart(page).click();

    const drawer = page.getByRole("dialog", { name: "Your order" });
    await expect(drawer).toBeVisible();
    // The line links twice — the thumbnail and the title — so this takes the first.
    await expect(drawer.getByRole("link", { name: product.name }).first()).toBeVisible();

    // "—" is what the drawer shows until /api/cart answers; a real figure means it did.
    const subtotal = drawer.getByTestId("cart-subtotal");
    await expect(subtotal).not.toHaveText("—");
    await expect(subtotal).toHaveText(/^\$[\d,]+\.\d{2}$/);
    await expect(drawer.getByRole("link", { name: "Secure checkout" })).toBeVisible();
  });

  test("changing the quantity re-prices the line against the server", async ({ page }) => {
    await page.goto(`/products/${product.slug}`);
    await addToCart(page).click();

    const drawer = page.getByRole("dialog", { name: "Your order" });
    const subtotal = drawer.getByTestId("cart-subtotal");
    await expect(subtotal).toHaveText(/^\$/);
    const before = await subtotal.textContent();

    const repriced = page.waitForResponse(
      (response) => response.url().includes("/api/cart") && response.request().method() === "POST",
    );
    await drawer.getByRole("button", { name: "Increase cases" }).click();
    await repriced;

    await expect(subtotal).not.toHaveText(before ?? "");
    await expect
      .poll(async () => cents(await subtotal.textContent()))
      .toBeGreaterThan(cents(before));
  });

  test("the drawer traps focus, closes on Escape and gives focus back", async ({ page }) => {
    await page.goto(`/products/${product.slug}`);
    await addToCart(page).click();
    const drawer = page.getByRole("dialog", { name: "Your order" });
    await expect(drawer).toBeVisible();

    // UX-3: focus moves into the dialog, and Shift+Tab off its first control stays inside it.
    await expect(drawer.getByRole("button", { name: "Close", exact: true })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect
      .poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))))
      .toBe(true);

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(addToCart(page)).toBeFocused();
  });

  test("the quantity survives a reload but the price is fetched again", async ({ page }) => {
    await page.goto(`/products/${product.slug}`);
    await addToCart(page).click();
    const drawer = page.getByRole("dialog", { name: "Your order" });
    await expect(drawer.getByTestId("cart-subtotal")).toHaveText(/^\$/);
    const priced = await drawer.getByTestId("cart-subtotal").textContent();

    await page.reload();
    // Local storage holds quantities only: nothing in it can carry a price (SEP-3).
    const stored = await page.evaluate(() => window.localStorage.getItem("ciputra_cart_v1"));
    expect(stored).not.toBeNull();
    expect(stored).not.toMatch(/price/i);

    await page.getByRole("button", { name: "Open cart" }).click();
    await expect(page.getByRole("dialog", { name: "Your order" }).getByTestId("cart-subtotal")).toHaveText(
      priced ?? "",
    );
  });
});

function cents(money: string | null): number {
  return Math.round(Number((money ?? "0").replace(/[^0-9.]/g, "")) * 100);
}
