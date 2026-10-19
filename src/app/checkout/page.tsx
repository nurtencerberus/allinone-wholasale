import { eq } from "drizzle-orm";
import { db } from "@/db";
import { addresses } from "@/db/schema";
import { CheckoutFlow } from "@/components/checkout/CheckoutFlow";
import { PriceLockNotice } from "@/components/PriceLockNotice";
import { canSeePrices, getSessionUser } from "@/lib/auth";

export const metadata = {
  title: "Secure wholesale checkout",
  description: "Three-step wholesale checkout with live dimensional freight, destination sales tax and Stripe Elements payment.",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  const user = await getSessionUser();
  if (!canSeePrices(user)) return <PriceLockNotice user={user} next="/checkout" />;
  let savedAddresses: (typeof addresses.$inferSelect)[] = [];
  if (user) {
    try {
      savedAddresses = await db.select().from(addresses).where(eq(addresses.userId, user.id));
    } catch (error) {
      console.error("[checkout-addresses]", error);
    }
  }

  return (
    <CheckoutFlow
      user={user}
      savedAddresses={savedAddresses.map((entry) => ({
        id: entry.id,
        label: entry.label,
        name: entry.name,
        company: entry.company,
        line1: entry.line1,
        line2: entry.line2,
        city: entry.city,
        state: entry.state,
        zip: entry.zip,
        phone: entry.phone,
        isDefault: entry.isDefault,
      }))}
    />
  );
}
