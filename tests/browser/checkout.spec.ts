import { ACCOUNTS, casesFor, expect, seedCart, signIn, test } from "./fixtures";
import { clearRateLimits, q, stockedProduct } from "./db";

/**
 * The three-step checkout wizard, in a browser, from an empty address form to a placed order.
 * The HTTP suites post the finished payload to /api/orders; nothing before this ran the steps a
 * buyer actually clicks — the address form, the freight quote, the terms gate and the payment tabs.
 *
 * ACH is the method under test: it reaches the same createOrderRecord() as a card without needing
 * Stripe Elements to load in the page.
 */
test("a trade buyer walks the checkout and places an ACH order", async ({ page }) => {
  await clearRateLimits();
  const product = await stockedProduct();
  const cases = casesFor(25_000, product.casePrice, product.minCases);

  await signIn(page, ACCOUNTS.buyer);
  // The account's cart lives on the server as well (SEP-7); start both copies from these cases.
  await page.request.put("/api/cart", { data: { items: [{ productId: product.id, cases }] } });
  await seedCart(page, [{ productId: product.id, cases }]);

  await page.goto("/checkout");
  await expect(page.getByRole("heading", { name: /Contact & delivery address/ })).toBeVisible();

  await page.getByLabel("Email for order confirmation *").fill(ACCOUNTS.buyer.email);
  await page.getByLabel("Receiving contact *").fill("Dana Whitfield");
  await page.getByLabel("Street address *").fill("88 Exchange Street");
  await page.getByLabel("City *").fill("Paterson");
  await page.getByLabel("State *").selectOption("NJ");
  await page.getByLabel("ZIP *").fill("07501");

  await page.getByRole("button", { name: /Price freight & tax/ }).click();

  // Step 2: the freight and tax figures are the server's, quoted from the ZIP.
  await expect(page.getByText("Billable weight").first()).toBeVisible();
  await expect(page.getByRole("radio").first()).toBeVisible();
  const toPayment = page.getByRole("button", { name: /Continue to payment/ });
  await expect(toPayment).toBeVisible();
  const quotedTotal = (await toPayment.textContent())?.match(/\$[\d,]+\.\d{2}/)?.[0];
  expect(quotedTotal).toBeTruthy();
  await toPayment.click();

  // Step 3: ACH, and the terms gate in front of it.
  await page.getByRole("tab", { name: /ACH \/ wire/ }).click();
  const placeOrder = page.getByRole("button", { name: /Place order · pay by ACH/ });
  await expect(placeOrder).toBeDisabled();
  await page.getByRole("checkbox").first().check();
  await expect(placeOrder).toBeEnabled();
  await expect(placeOrder).toContainText(quotedTotal!);

  await placeOrder.click();

  await page.waitForURL(/\/order\/MSC-/);
  const orderNumber = new URL(page.url()).pathname.split("/").pop()!;
  // The first copy of the number is in the print-only invoice header, which is hidden on screen.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("strong", { hasText: orderNumber }).first()).toBeVisible();
  await expect(page.getByText(/ACH|wire/i).first()).toBeVisible();

  // What the browser did has to be what the database holds.
  const [order] = await q<{ payment_status: string; total: number; status: string }>(
    "select payment_status, total, status from orders where order_number = $1",
    [orderNumber],
  );
  expect(order.status).toBe("processing");
  expect(order.payment_status).toBe("awaiting_payment");
  expect(order.total).toBe(Math.round(Number(quotedTotal!.replace(/[^0-9.]/g, "")) * 100));
});
