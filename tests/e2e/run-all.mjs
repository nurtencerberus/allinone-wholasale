// Runs every e2e suite in order and fails if any fails.
import { spawnSync } from "node:child_process";
const suites = ["auth", "account", "cart", "coupons", "pricelock", "payments", "faz1", "a11y", "account-pricing", "quotes"];
let failed = 0;
for (const suite of suites) {
  console.log(`\n=== ${suite} ===`);
  const result = spawnSync(process.execPath, [new URL(`./${suite}.mjs`, import.meta.url).pathname], { stdio: "inherit" });
  if (result.status !== 0) failed += 1;
}
console.log(failed ? `\n${failed} suite(s) failed` : "\nall suites passed");
process.exit(failed ? 1 : 0);
