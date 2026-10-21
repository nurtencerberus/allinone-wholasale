import { test as base, expect, type Page } from "@playwright/test";

/**
 * Every browser test runs with a guard on the console: an uncaught exception or a hydration
 * mismatch anywhere in the test fails it. That is most of the reason these tests exist — a React
 * error on the client never reaches the HTTP suites, and the page still returns 200 with it.
 */
export const test = base.extend<{ clientErrors: void }>({
  clientErrors: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on("pageerror", (error) => problems.push(`uncaught: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        const text = message.text();
        // Only the errors that mean the client is broken; a failed image or a 401 is not one.
        if (/hydrat|did not match|Minified React error|Maximum update depth/i.test(text)) {
          problems.push(`console: ${text}`);
        }
      });
      await use();
      expect(problems, "the page reported client errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** The demo accounts the seed creates (src/lib/seed.ts); demo mode only. */
export const ACCOUNTS = {
  buyer: { email: "buyer@harborhouse.com", password: "Trade123!" },
  admin: { email: "admin@ciputracorp.com", password: "Admin123!" },
  retail: { email: "customer@example.com", password: "Customer123!" },
};

/**
 * The sign-in form, scoped to the main landmark: the footer newsletter has an "Email address"
 * field of its own, so an unscoped label query matches two inputs.
 */
export function authForm(page: Page) {
  return page.getByRole("main");
}

/** Sign in through the real form, which is the point: no cookie is injected. */
export async function signIn(page: Page, account: { email: string; password: string }): Promise<void> {
  await page.goto("/login");
  const form = authForm(page);
  await form.getByLabel("Email address").fill(account.email);
  await form.getByLabel("Password", { exact: true }).fill(account.password);
  await form.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/**
 * Put quantities in the cart before the page loads. The drawer has its own spec; where the
 * checkout wizard is what is under test, clicking a quantity up thirty times proves nothing.
 */
export async function seedCart(page: Page, items: { productId: number; cases: number }[]): Promise<void> {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key as string, value as string),
    ["ciputra_cart_v1", JSON.stringify(items)] as const,
  );
}

/**
 * The product page's own add-to-cart button. The related-product cards carry an aria-label of
 * "Add 1 case of <name> to cart", so the price in this one's label is what tells them apart.
 */
export function addToCart(page: Page) {
  return page.getByRole("button", { name: /^Add \d+ cases? · \$/ });
}

/** Cases needed to clear a dollar amount in cents at this case price. */
export function casesFor(targetCents: number, casePrice: number, minCases: number): number {
  return Math.max(minCases, Math.ceil(targetCents / casePrice));
}
