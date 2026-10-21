import { expect, test } from "./fixtures";

/**
 * UX-3 keyboard behaviour that only exists at runtime: the skip link and the landmark it jumps to.
 * The HTML is checked by tests/e2e/a11y.mjs; what a keyboard does with it is checked here.
 */
test("the skip link is reachable by keyboard and moves focus to the main landmark", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");

  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  // It is visually hidden until focused; focus has to make it visible, not just focusable.
  await expect(skip).toBeInViewport();

  await page.keyboard.press("Enter");
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id))
    .toBe("main-content");
});

test("moving between pages is a client transition that still lands on a heading", async ({ page }) => {
  await page.goto("/shop");
  // A marker that only survives if the App Router navigates without reloading the document.
  await page.evaluate(() => {
    (window as unknown as { soft?: boolean }).soft = true;
  });

  await page.locator('a[href^="/products/"]').first().click();
  await page.waitForURL(/\/products\//);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const soft = await page.evaluate(() => (window as unknown as { soft?: boolean }).soft);
  expect(soft, "the catalog link navigated without a full page load").toBe(true);
});
